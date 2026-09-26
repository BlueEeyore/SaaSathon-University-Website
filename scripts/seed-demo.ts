/** Seed local-only classes, student accounts, lectures and analytics for demos. */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { copyFile, link, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

// Node 22 provides WebSocket natively. This small local fallback also lets the
// one-off seed command run on older dev machines that already have `ws` installed.
if (typeof globalThis.WebSocket === "undefined") {
  Object.assign(globalThis, { WebSocket: createRequire(import.meta.url)("ws") });
}

const lecturerEmail = "ron.spam05@gmail.com";
const classes = [
  { title: "Introduction to Computer Science", description: "Core concepts, problem solving, and programming foundations." },
  { title: "Data and Statistics", description: "Reading data, statistical reasoning, and practical analysis." },
  { title: "Research Methods", description: "Study design, evidence, and communicating research findings." },
];
const studentCount = 8;
const demoDomain = "demo.invalid";
const sourceLectureId = "59fd3e8d-be3a-4d1c-a6ac-af7d1dbab249";
const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function stableUuid(value: string) {
  const hex = createHash("sha256").update(`saasathon-demo:${value}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function stableCode(value: string) {
  const bytes = createHash("sha256").update(`join-code:${value}`).digest();
  return Array.from({ length: 10 }, (_, index) => alphabet[bytes[index] % alphabet.length]).join("");
}

function parseTimestamp(value: string) {
  const [hours, minutes, seconds] = value.split(":");
  return Math.round((Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000);
}

function parseVtt(contents: string) {
  const cues = contents.replace(/^WEBVTT\s*/, "").trim().split(/\n\s*\n/);
  const segments: Array<{ index: number; start_ms: number; end_ms: number; text: string; words: Array<{ w: string; start_ms: number; end_ms: number }> }> = [];
  for (const cue of cues) {
    const lines = cue.split(/\r?\n/);
    const timeLine = lines.find((line) => line.includes(" --> "));
    if (!timeLine) continue;
    const [start, end] = timeLine.split(" --> ");
    const text = lines.slice(lines.indexOf(timeLine) + 1).join(" ").trim();
    if (!text) continue;
    const startMs = parseTimestamp(start);
    const endMs = parseTimestamp(end);
    const words = text.match(/\S+/g) ?? [];
    segments.push({
      index: segments.length,
      start_ms: startMs,
      end_ms: endMs,
      text,
      words: words.map((word, index) => ({
        w: word,
        start_ms: Math.min(endMs - 1, startMs + Math.floor((endMs - startMs) * index / words.length)),
        end_ms: Math.min(endMs, startMs + Math.max(1, Math.floor((endMs - startMs) * (index + 1) / words.length))),
      })),
    });
  }
  return segments;
}

function statusJson() {
  return JSON.parse(execFileSync("node_modules/.bin/supabase", ["status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })) as { API_URL: string; SERVICE_ROLE_KEY: string };
}

async function main() {
  let local: ReturnType<typeof statusJson>;
  try {
    local = statusJson();
  } catch {
    throw new Error("The local Supabase stack is unavailable. Start it with pnpm db:start, then retry.");
  }
  const apiUrl = new URL(local.API_URL);
  if (!(["127.0.0.1", "localhost", "::1"].includes(apiUrl.hostname)) || apiUrl.port !== "55431") {
    throw new Error("Refusing to seed anything except this project's local Supabase database.");
  }
  if (!local.SERVICE_ROLE_KEY) throw new Error("The local Supabase service key was not returned by Supabase CLI.");

  const mediaRoot = path.resolve(process.env.MEDIA_ROOT?.trim() || "./media");
  const sourceVideo = path.join(mediaRoot, "video", `${sourceLectureId}.mp4`);
  const sourceCaptions = path.join(mediaRoot, "captions", `${sourceLectureId}.vtt`);
  const sourceInfo = await stat(sourceVideo).catch(() => null);
  if (!sourceInfo?.isFile()) throw new Error(`Prepared local demo video was not found: ${sourceVideo}`);
  const captionText = await (await import("node:fs/promises")).readFile(sourceCaptions, "utf8");
  const segments = parseVtt(captionText);
  if (!segments.length) throw new Error("The prepared demo video has no usable caption transcript.");
  const durationMs = 3_301_800;
  const supabase = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: lecturer, error: lecturerError } = await supabase.from("profiles")
    .select("user_id, email").eq("email", lecturerEmail).maybeSingle();
  if (lecturerError) throw lecturerError;
  if (!lecturer) throw new Error(`No local lecturer profile found for ${lecturerEmail}. Sign in once as this lecturer first.`);

  const users: Array<{ id: string; email: string; full_name: string }> = [];
  const existingUsers = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (existingUsers.error) throw existingUsers.error;
  const usersByEmail = new Map(existingUsers.data.users.map((user) => [user.email?.toLowerCase(), user]));
  for (let index = 1; index <= studentCount * classes.length; index++) {
    const email = `student${String(index).padStart(2, "0")}@${demoDomain}`;
    const full_name = ["Alex Morgan", "Jamie Patel", "Taylor Chen", "Jordan Lee", "Casey Brown", "Riley Wilson", "Avery Singh", "Sam Taylor"][((index - 1) % 8)];
    let user = usersByEmail.get(email);
    if (!user) {
      const created = await supabase.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name } });
      if (created.error) throw created.error;
      user = created.data.user;
      usersByEmail.set(email, user);
    }
    const profile = await supabase.from("profiles").upsert({ user_id: user.id, email, full_name, role: "student" }, { onConflict: "user_id" });
    if (profile.error) throw profile.error;
    users.push({ id: user.id, email, full_name });
  }

  const lectureIds: string[] = [];
  const classRows: Array<{ id: string; title: string; join_code: string }> = [];
  for (let classIndex = 0; classIndex < classes.length; classIndex++) {
    const classInfo = classes[classIndex];
    const classId = stableUuid(`class:${classInfo.title}`);
    const lectureId = stableUuid(`lecture:${classInfo.title}`);
    lectureIds.push(lectureId);
    const classRow = await supabase.from("classes").upsert({
      id: classId, title: classInfo.title, description: classInfo.description,
      join_code: stableCode(classInfo.title), lecturer_id: lecturer.user_id,
    }, { onConflict: "id" }).select("id, title, join_code").single();
    if (classRow.error) throw classRow.error;
    classRows.push(classRow.data);
    const lecturerMembership = await supabase.from("class_members").upsert(
      { class_id: classId, user_id: lecturer.user_id, role: "lecturer" }, { onConflict: "class_id,user_id" },
    );
    if (lecturerMembership.error) throw lecturerMembership.error;
    const firstStudent = classIndex * studentCount;
    const memberships = users.slice(firstStudent, firstStudent + studentCount).map((student) => ({
      class_id: classId, user_id: student.id, role: "student" as const,
    }));
    const memberRows = await supabase.from("class_members").upsert(memberships, { onConflict: "class_id,user_id" });
    if (memberRows.error) throw memberRows.error;

    const lecture = await supabase.from("lectures").upsert({
      id: lectureId, class_id: classId, title: "Course check-in and lecture discussion",
      description: "Prepared demo recording with synthetic student engagement data.",
      source_format: "mp4", source_bytes: sourceInfo.size, duration_ms: durationMs, status: "ready",
    }, { onConflict: "id" });
    if (lecture.error) throw lecture.error;
    const transcript = await supabase.from("transcripts").upsert({
      lecture_id: lectureId, language: "en", provider: "demo-seed", model: "caption-import",
      text: segments.map((segment) => segment.text).join(" "), segments,
    }, { onConflict: "lecture_id" });
    if (transcript.error) throw transcript.error;

    const videoPath = path.join(mediaRoot, "video", `${lectureId}.mp4`);
    const captionsPath = path.join(mediaRoot, "captions", `${lectureId}.vtt`);
    await mkdir(path.dirname(videoPath), { recursive: true });
    await mkdir(path.dirname(captionsPath), { recursive: true });
    try { await link(sourceVideo, videoPath); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") { /* already seeded */ }
      else if (["EXDEV", "EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) await copyFile(sourceVideo, videoPath);
      else throw error;
    }
    await copyFile(sourceCaptions, captionsPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
  }

  // Replace only analytics rows attached to these deterministic demo lectures.
  const clear = await supabase.from("watch_events").delete().in("lecture_id", lectureIds);
  if (clear.error) throw clear.error;
  const baseDate = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const events: Array<Record<string, unknown>> = [];
  for (let classIndex = 0; classIndex < classes.length; classIndex++) {
    const lectureId = lectureIds[classIndex];
    for (let studentIndex = 0; studentIndex < studentCount; studentIndex++) {
      const student = users[classIndex * studentCount + studentIndex];
      const finalPercent = [18, 24, 42, 57, 68, 78, 96, 100][studentIndex];
      const sessionId = stableUuid(`session:${lectureId}:${student.id}`);
      const watchedMs = Math.round(durationMs * finalPercent / 100);
      const createdAt = new Date(baseDate + (classIndex * 8 + studentIndex) * 24 * 60 * 60 * 1000).toISOString();
      const positionMs = Math.round(durationMs * finalPercent / 100);
      events.push({ lecture_id: lectureId, user_id: student.id, session_id: sessionId, type: "open", position_ms: 0, duration_ms: durationMs, watched_ms: 0, created_at: createdAt });
      events.push({ lecture_id: lectureId, user_id: student.id, session_id: sessionId, type: "play", position_ms: 0, duration_ms: durationMs, watched_ms: 0, created_at: new Date(Date.parse(createdAt) + 1000).toISOString() });
      let remainingMs = watchedMs;
      let elapsedSeconds = 10;
      while (remainingMs > 0) {
        const chunkMs = Math.min(60_000, remainingMs);
        events.push({
          lecture_id: lectureId, user_id: student.id, session_id: sessionId,
          type: "heartbeat", position_ms: positionMs - remainingMs + chunkMs,
          duration_ms: durationMs, watched_ms: chunkMs,
          created_at: new Date(Date.parse(createdAt) + elapsedSeconds * 1000).toISOString(),
        });
        remainingMs -= chunkMs;
        elapsedSeconds += 60;
      }
      events.push({
        lecture_id: lectureId, user_id: student.id, session_id: sessionId,
        type: finalPercent === 100 ? "ended" : "pause", position_ms: positionMs,
        duration_ms: durationMs, watched_ms: 0,
        created_at: new Date(Date.parse(createdAt) + elapsedSeconds * 1000).toISOString(),
      });
    }
  }
  const inserted = await supabase.from("watch_events").insert(events);
  if (inserted.error) throw inserted.error;

  console.log(`Seeded ${classRows.length} classes, ${users.length} synthetic students, ${lectureIds.length} prepared lectures, and ${events.length} watch events for ${lecturerEmail}.`);
  for (const row of classRows) console.log(`- ${row.title} (join code ${row.join_code})`);
  console.log("Demo students use reserved @demo.invalid emails and are not assigned passwords.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Demo seeding failed.");
  process.exitCode = 1;
});
