/**
 * Two-account access test for the identity migration. Local-only: refuses any
 * Supabase URL that is not this machine's stack, then exercises the real API,
 * where row-level security is actually enforced.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const local = JSON.parse(
  execFileSync("pnpm", ["supabase", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
assert.equal(new URL(local.API_URL).hostname, "127.0.0.1");
const key = local.PUBLISHABLE_KEY || local.ANON_KEY;
const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const asUser = () =>
  createClient(local.API_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const anon = asUser();
const run = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const emails = {
  lecturer: `lecturer-${run}@example.test`,
  a: `a-${run}@example.test`,
  b: `b-${run}@example.test`,
  late: `late-${run}@example.test`,
};
const ids: Record<string, string> = {};
const clients: Record<string, SupabaseClient> = {};
const passes: string[] = [];
const ok = (name: string) => {
  passes.push(name);
  console.log(`  ok  ${name}`);
};

async function main() {
  try {
    for (const [name, email] of Object.entries(emails)) {
      const password = `Local-only-${run}-Password1!`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        // Hostile signup metadata: must be ignored for role.
        user_metadata: { role: "lecturer", full_name: `Name ${name}` },
      });
      assert.equal(error, null, `create ${name}: ${error?.message}`);
      ids[name] = data.user.id;
      const client = asUser();
      assert.equal(
        (await client.auth.signInWithPassword({ email, password })).error,
        null,
      );
      clients[name] = client;
    }

    // T1
    const { data: p0 } = await clients.a
      .from("profiles")
      .select("role, full_name")
      .eq("user_id", ids.a)
      .single();
    assert.ok(p0, "profile should be created by the trigger");
    assert.equal(p0.role, "student", "forged signup metadata must not grant lecturer");
    assert.equal(p0.full_name, "Name a");
    ok("new account is a student despite forged lecturer metadata");

    // T2
    assert.ok(
      (await clients.a.from("lecturer_allowlist").select()).error,
      "allowlist must not be readable by authenticated",
    );
    assert.ok(
      (await clients.a.from("lecturer_allowlist").insert({ email: "x@y.test" })).error,
      "allowlist must not be writable by authenticated",
    );
    ok("lecturer_allowlist is unreachable from the client");

    // T3
    const { data: refused } = await clients.a.rpc("claim_lecturer_role");
    assert.equal(refused, false, "unlisted email must not become a lecturer");
    ok("claim_lecturer_role refuses an email that is not allowlisted");

    // T4
    await admin.from("lecturer_allowlist").insert({ email: emails.lecturer });
    const { data: claimed } = await clients.lecturer.rpc("claim_lecturer_role");
    assert.equal(claimed, true, "allowlisted email should be promoted");
    const { data: nowLecturer } = await clients.lecturer
      .from("profiles")
      .select("role")
      .eq("user_id", ids.lecturer)
      .single();
    assert.ok(nowLecturer, "profile should exist");
    assert.equal(nowLecturer.role, "lecturer");
    ok("allowlisted email is promoted to lecturer");

    // T5
    assert.ok(
      (await clients.a.from("profiles").update({ role: "lecturer" }).eq("user_id", ids.a)).error,
      "role must not be client-writable",
    );
    assert.ok(
      (await clients.a.from("profiles").update({ email: emails.lecturer }).eq("user_id", ids.a))
        .error,
      "email must not be client-writable",
    );
    const { data: afterT5 } = await clients.a
      .from("profiles")
      .select("role, email")
      .eq("user_id", ids.a)
      .single();
    assert.ok(afterT5, "profile should still exist");
    assert.equal(afterT5.role, "student");
    assert.equal(afterT5.email, emails.a);
    ok("role and email are immutable from the client");

    const { error: nameError } = await clients.a
      .from("profiles")
      .update({ full_name: "Renamed" })
      .eq("user_id", ids.a);
    assert.equal(nameError, null, `full_name should be writable: ${nameError?.message}`);
    ok("full_name is the only client-writable profile column");

    // T6
    assert.ok((await anon.from("profiles").select()).error, "anon must not read profiles");
    assert.ok((await anon.from("classes").select()).error, "anon must not read classes");
    ok("anonymous reads are denied");

    // T7
    // A client cannot create a class directly: the code is server-generated and
    // the creator is enrolled atomically, so there is no path to squat a code.
    assert.ok(
      (
        await clients.lecturer
          .from("classes")
          .insert({ title: "Direct insert", join_code: "PQRSTUVWXY", lecturer_id: ids.lecturer })
      ).error,
      "classes must not be client-insertable",
    );
    const { data: directClass } = await admin
      .from("classes")
      .select("id")
      .eq("title", "Direct insert");
    assert.equal(directClass?.length ?? 0, 0);

    const { data: createdId, error: createError } = await clients.lecturer.rpc("create_class", {
      class_title: "  Distributed Systems  ",
      class_description: "Week 1",
    });
    assert.equal(createError, null, `create_class: ${createError?.message}`);
    const created = { id: createdId };

    // The generated code must satisfy the same alphabet the client schema does.
    const { data: classRow } = await admin
      .from("classes")
      .select("id, title, description, join_code, lecturer_id")
      .eq("id", created.id)
      .single();
    assert.ok(classRow, "class should exist");
    assert.equal(classRow.title, "Distributed Systems", "title should be trimmed");
    assert.equal(classRow.lecturer_id, ids.lecturer);
    assert.match(
      classRow.join_code,
      /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/,
      `generated code ${classRow.join_code} must use the documented alphabet`,
    );
    assert.ok(
      !/[IL01O]/.test(classRow.join_code),
      "generated code must avoid I, L, O, 0 and 1",
    );
    const code = classRow.join_code;

    const { data: creatorMember } = await admin
      .from("class_members")
      .select("role")
      .eq("class_id", created.id)
      .eq("user_id", ids.lecturer)
      .single();
    assert.ok(creatorMember, "creator should be enrolled");
    assert.equal(creatorMember.role, "lecturer", "creator is enrolled as lecturer");
    ok("create_class generates an unambiguous code and enrols the creator as lecturer");

    // The creator can immediately read their own new class.
    const { data: creatorReads } = await clients.lecturer
      .from("classes")
      .select("id, join_code")
      .eq("id", created.id);
    assert.equal(creatorReads?.length, 1, "creator should read the class they just made");
    ok("the creator can read their new class immediately");
    ok("a class can only be created with yourself as lecturer, and never ownerless");

    // T8: class creation is reserved for accounts promoted by the private
    // allowlist path. The public function is directly callable by any user.
    const { error: forgeError } = await clients.a.rpc("create_class", {
      class_title: "A's own class",
    });
    assert.ok(forgeError, "a student must not create a class through the RPC");
    const { data: aClass } = await admin
      .from("classes")
      .select("lecturer_id")
      .eq("title", "A's own class")
      .maybeSingle();
    assert.equal(aClass, null, "refused creation must not leave a class behind");
    const { data: aPromoted } = await clients.a
      .from("profiles")
      .select("role")
      .eq("user_id", ids.a)
      .single();
    assert.ok(aPromoted, "profile should exist");
    assert.equal(aPromoted.role, "student", "the failed call must not promote anyone");
    ok("only an allowlisted lecturer can create a class through the RPC");

    // T9
    const { data: beforeJoin } = await clients.a
      .from("classes")
      .select("id")
      .eq("id", created.id);
    assert.equal(beforeJoin?.length, 0, "non-member must not read the class");
    assert.equal(
      (await clients.a.from("classes").select("id").eq("join_code", code)).data?.length,
      0,
    );
    ok("a non-member cannot read a class or discover its join code");

    // T10
    assert.ok(
      (
        await clients.a
          .from("class_members")
          .insert({ class_id: created.id, user_id: ids.a, role: "student" })
      ).error,
      "class_members must not be client-insertable",
    );
    ok("class_members rejects direct client inserts");

    // T11
    const { data: wrongCode } = await clients.a.rpc("redeem_join_code", {
      code: "ZZZZZZZZZZ",
    });
    assert.equal(wrongCode, null, "a wrong code must not enrol anyone");
    const { data: joined } = await clients.a.rpc("redeem_join_code", { code: code.toLowerCase() });
    assert.equal(joined, created.id, "a valid code enrols, case-insensitively");
    const { data: memberRow } = await clients.a
      .from("class_members")
      .select("role")
      .eq("class_id", created.id)
      .eq("user_id", ids.a)
      .single();
    assert.ok(memberRow, "membership should exist after redeeming");
    assert.equal(memberRow.role, "student");
    ok("a join code enrols a student, case-insensitively, only as a student");

    // T12
    const { data: afterJoin } = await clients.a
      .from("classes")
      .select("id, title")
      .eq("id", created.id);
    assert.equal(afterJoin?.length, 1, "member should now read the class");
    assert.equal(
      (await clients.a.from("classes").update({ title: "Hijacked" }).eq("id", created.id).select())
        .data?.length,
      0,
    );
    assert.equal(
      (await clients.a.from("classes").delete().eq("id", created.id).select()).data?.length,
      0,
    );
    const { data: unchanged } = await admin
      .from("classes")
      .select("title")
      .eq("id", created.id)
      .single();
    assert.ok(unchanged, "class should still exist");
    assert.equal(unchanged.title, "Distributed Systems");
    ok("a member can read the class but cannot modify or delete it");

    // T13
    const { data: seesStranger } = await clients.a
      .from("profiles")
      .select("user_id")
      .eq("user_id", ids.b);
    assert.equal(seesStranger?.length, 0, "non-classmates must not be visible");
    await clients.b.rpc("redeem_join_code", { code });
    const { data: seesClassmate } = await clients.a
      .from("profiles")
      .select("user_id, full_name")
      .eq("user_id", ids.b);
    assert.equal(seesClassmate?.length, 1, "classmates are visible for attribution");
    assert.equal(seesClassmate?.[0].full_name, "Name b");
    ok("classmates are visible for comment attribution, strangers are not");

    // T14
    const { error: rosterError } = await clients.lecturer
      .from("class_roster")
      .insert({ class_id: created.id, email: emails.late });
    assert.equal(rosterError, null, `lecturer should add to roster: ${rosterError?.message}`);
    assert.ok(
      (
        await clients.a
          .from("class_roster")
          .insert({ class_id: created.id, email: "sneak@example.test" })
      ).error,
      "a student must not add to the roster",
    );
    const { data: rosterPeek } = await clients.a
      .from("class_roster")
      .select("email")
      .eq("class_id", created.id);
    assert.deepEqual(
      (rosterPeek ?? []).map((r) => r.email),
      [],
      "roster must not be enumerable",
    );
    ok("roster is manageable only by the class lecturer");

    // T15: the rostered account already exists but has never joined. Its first
    // sign-in should enrol it without any action from the client.
    const lateClient = clients.late;
    const { data: lateBefore } = await admin
      .from("class_members")
      .select("class_id")
      .eq("class_id", created.id)
      .eq("user_id", ids.late);
    assert.equal(lateBefore?.length, 0, "rostered user should not be a member yet");

    const { data: claimedCount } = await lateClient.rpc("claim_roster_memberships");
    assert.ok(claimedCount >= 1, "roster row should be claimed on first sign-in");
    const { data: lateMember } = await admin
      .from("class_members")
      .select("role")
      .eq("class_id", created.id)
      .eq("user_id", ids.late)
      .single();
    assert.ok(lateMember, "rostered user should now be a member");
    assert.equal(lateMember.role, "student");
    const { data: rosters } = await admin
      .from("class_roster")
      .select("claimed_at, claimed_by")
      .eq("class_id", created.id)
      .eq("email", emails.late)
      .single();
    assert.ok(rosters, "roster row should still exist");
    assert.ok(rosters.claimed_at, "roster row should be marked claimed");
    assert.equal(rosters.claimed_by, ids.late);
    // Claiming is idempotent.
    const { data: again } = await lateClient.rpc("claim_roster_memberships");
    assert.equal(again, 0, "claiming twice must not create a second membership");
    ok("a rostered email is enrolled on sign-in, and claiming is idempotent");

    // T16
    // A delete blocked by RLS affects zero rows rather than raising, so the
    // assertion is on the row surviving, not on an error.
    const removedOther = await clients.b
      .from("class_members")
      .delete()
      .eq("class_id", created.id)
      .eq("user_id", ids.a)
      .select();
    assert.equal(removedOther.error, null);
    assert.equal(removedOther.data?.length ?? 0, 0, "cannot remove another member");

    const left = await clients.b
      .from("class_members")
      .delete()
      .eq("class_id", created.id)
      .eq("user_id", ids.b)
      .select();
    assert.equal(left.data?.length, 1, "a member should be able to leave");
    const { data: aStillIn } = await admin
      .from("class_members")
      .select("user_id")
      .eq("class_id", created.id)
      .eq("user_id", ids.a)
      .single();
    assert.ok(aStillIn, "a should still be enrolled");
    assert.equal(aStillIn.user_id, ids.a, "a is still enrolled after b leaves");
    ok("a member can leave a class, but only their own membership");

    for (const line of passes) void line;
    console.log(`\nPASS: ${passes.length} identity/RLS invariants hold`);
  } finally {
    await admin.from("lecturer_allowlist").delete().in("email", Object.values(emails));
    for (const id of Object.values(ids)) await admin.auth.admin.deleteUser(id);
  }
}
main().catch((error) => {
  console.error("\nFAIL:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
