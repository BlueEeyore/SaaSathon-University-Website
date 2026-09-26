/** Local-only, real Supabase + HTTP smoke test. Never accepts a remote project. */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { load } from "cheerio";

async function main() {
  const local = JSON.parse(
    execFileSync("pnpm", ["supabase", "status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
  assert.equal(
    new URL(local.API_URL).hostname,
    "127.0.0.1",
    "Only the local Supabase stack is allowed",
  );
  assert.equal(
    new URL(local.API_URL).port,
    "55431",
    "Use this starter's isolated test stack",
  );
  const key = local.PUBLISHABLE_KEY || local.ANON_KEY;
  const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const publicClient = () =>
    createClient(local.API_URL, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  const alice = publicClient();
  const bob = publicClient();
  const anonymous = publicClient();
  const userIds: string[] = [];
  const passwords = new Map<string, string>();
  const run = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const aliceEmail = `alice-${run}@example.test`;
  const bobEmail = `bob-${run}@example.test`;
  let server: ReturnType<typeof spawn> | undefined;
  try {
    for (const [client, email] of [
      [alice, aliceEmail],
      [bob, bobEmail],
    ] as const) {
      const password = `local-only-${run}-Password1!`;
      passwords.set(email, password);
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      assert.equal(error, null);
      userIds.push(data.user!.id);
      assert.equal(
        (await client.auth.signInWithPassword({ email, password })).error,
        null,
      );
    }
    assert.equal((await admin.from("lecturer_allowlist").insert({ email: aliceEmail })).error, null);
    assert.equal((await alice.rpc("claim_lecturer_role")).data, true);
    const { data: record, error } = await alice
      .from("ideas")
      .insert({
        title: "Private test idea",
        description: "Owner only",
        user_id: userIds[0],
      })
      .select()
      .single();
    assert.equal(error, null);
    assert.equal(
      (await alice.from("ideas").select().eq("id", record.id)).data?.length,
      1,
    );
    assert.equal(
      (await bob.from("ideas").select().eq("id", record.id)).data?.length,
      0,
    );
    assert.ok(
      (await anonymous.from("ideas").select()).error,
      "Anonymous reads are denied",
    );
    assert.ok(
      (
        await anonymous
          .from("ideas")
          .insert({ title: "Anonymous", user_id: userIds[0] })
      ).error,
    );
    assert.ok(
      (
        await bob
          .from("ideas")
          .insert({ title: "Forged owner", user_id: userIds[0] })
      ).error,
    );
    assert.equal(
      (
        await bob
          .from("ideas")
          .update({ title: "Intrusion" })
          .eq("id", record.id)
          .select()
      ).data?.length,
      0,
    );
    assert.equal(
      (await bob.from("ideas").delete().eq("id", record.id).select()).data
        ?.length,
      0,
    );
    assert.ok(
      (
        await alice
          .from("ideas")
          .update({ user_id: userIds[1] })
          .eq("id", record.id)
      ).error,
      "Ownership is immutable",
    );
    assert.ok(
      (await alice.from("ideas").insert({ title: "   ", user_id: userIds[0] }))
        .error,
    );
    assert.ok(
      (
        await alice.from("ideas").insert({
          title: "Too long",
          description: "x".repeat(2001),
          user_id: userIds[0],
        })
      ).error,
    );
    assert.equal(
      (
        await alice
          .from("ideas")
          .update({ title: "Updated" })
          .eq("id", record.id)
      ).error,
      null,
    );
    assert.equal(
      (await alice.from("ideas").select().eq("id", record.id).single()).data
        ?.title,
      "Updated",
    );
    assert.equal(
      (await alice.from("ideas").delete().eq("id", record.id)).error,
      null,
    );
    assert.equal(
      (await alice.from("ideas").select().eq("id", record.id)).data?.length,
      0,
    );
    console.log(
      "PASS: database CRUD, anonymous denial, cross-account isolation, immutable ownership and DB validation",
    );

    const env = {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
    };
    execFileSync("pnpm", ["build"], { env, stdio: "pipe" });
    const portProbe = createServer();
    portProbe.listen(0, "127.0.0.1");
    await once(portProbe, "listening");
    const address = portProbe.address();
    assert.ok(address && typeof address === "object");
    const port = address.port;
    await new Promise<void>((resolve) => portProbe.close(() => resolve()));
    server = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      { env, stdio: "ignore" },
    );
    const origin = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(origin)).ok) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const cookies = new Map<string, string>();
    async function request(path: string, init: RequestInit = {}) {
      const response = await fetch(`${origin}${path}`, {
        ...init,
        redirect: "manual",
        headers: {
          Cookie: [...cookies]
            .map(([name, value]) => `${name}=${value}`)
            .join("; "),
          Origin: origin,
          ...init.headers,
        },
      });
      for (const cookie of response.headers.getSetCookie()) {
        const [part] = cookie.split(";");
        const i = part.indexOf("=");
        cookies.set(part.slice(0, i), part.slice(i + 1));
      }
      return response;
    }
    async function submit(
      path: string,
      html: string,
      selector: string,
      fields: Record<string, string>,
    ) {
      const $ = load(html);
      const form = $(selector).first();
      assert.ok(form.length, `Missing form ${selector}`);
      const body = new FormData();
      form.find('input[type="hidden"]').each((_, input) => {
        body.append($(input).attr("name")!, $(input).attr("value") ?? "");
      });
      for (const [name, value] of Object.entries(fields)) body.set(name, value);
      return request(path, { method: "POST", body });
    }
    let response = await request("/classes");
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "/login");
    const login = await (await request("/login")).text();
    assert.ok(login.includes("Continue with Google"), "Google OAuth is the sign-in path");

    async function signInFor(email: string) {
      cookies.clear();
      const sessionClient = createServerClient(local.API_URL, key, {
        cookies: {
          getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
          setAll(values) {
            values.forEach(({ name, value }) => cookies.set(name, value));
          },
        },
      });
      const password = passwords.get(email)!;
      assert.equal((await sessionClient.auth.signInWithPassword({ email, password })).error, null);
    }

    await signInFor(aliceEmail);
    let html = await (await request("/classes")).text();
    assert.ok(html.includes("Create a class"));
    response = await submit("/classes", html, 'form:has(input[name="title"])', {
      title: "HTTP Workflow Class",
      description: "Created through the lecturer action",
    });
    assert.equal(response.status, 303);
    const { data: httpClass } = await admin.from("classes").select("id, join_code").eq("title", "HTTP Workflow Class").single();
    assert.ok(httpClass);
    html = await (await request(`/classes/${httpClass.id}`)).text();
    assert.ok(html.includes("Invite students"));
    assert.ok(html.includes(httpClass.join_code.slice(0, 5)));

    await signInFor(bobEmail);
    html = await (await request("/classes")).text();
    assert.ok(html.includes("Join a class"));
    response = await submit("/classes", html, 'form:has(input[name="code"])', { code: httpClass.join_code });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), `/classes/${httpClass.id}`);
    html = await (await request(`/classes/${httpClass.id}`)).text();
    assert.ok(html.includes("Lecture library"));
    console.log("PASS: Google sign-in entry, protected classes, lecturer create, join-code sharing, and student enrollment");
  } finally {
    server?.kill("SIGTERM");
    await admin.from("lecturer_allowlist").delete().eq("email", aliceEmail);
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Integration test failed",
  );
  process.exitCode = 1;
});
