# Lecture Capture — Project Plan

Supersedes the original feature sketch. Feature *intent* is preserved in "Product scope";
everything under "Decisions" is settled and should not be re-litigated during implementation.

Status: **reviewed, not started.** Open items in "Before we build" must be closed first.

---

## Product scope

Lecturers upload a lecture recording. The site transcribes it and serves a transcript that
follows the video, with captions. Lecturers manage their classes and students. Students and
lecturers highlight the transcript, comment on it, and reply to each other. Lecturers get an
engagement analytics dashboard. Later, AI summarises lectures and answers questions across a
class.

### Demo spine (must work end to end)

1. Lecturer creates a class, shares a join code.
2. Lecturer uploads a lecture video; it is normalised and transcribed.
3. Student joins by code, watches the video with a transcript that follows along plus captions.
4. Student highlights transcript text or a timestamp, comments, and gets a reply.
5. Lecturer opens the dashboard: views, average watch %, drop-off curve, per-student completion.

### Phase 2 (after the demo works)

- AI lecture overview from the transcript.
- AI Q&A across a class, returning relevant transcript sections.
- CSV roster import. Committed, not optional — just not demo-critical, since the join code covers
  enrolment for the demo.
- Real Moodle wiring (LTI 1.3 or REST), behind the provider interface built in Phase 1.

Phase 2 was deliberately deferred. The AI features were the most likely to be half-working on
demo day, and deferring them keeps the demo spine buildable.

---

## Decisions

| Area | Decision |
|---|---|
| Language | TypeScript throughout. One exception: a small Python worker for Whisper, behind an HTTP interface, swappable. |
| Framework | Existing Next.js App Router + Supabase starter. No rewrite. |
| App hosting | Self-hosted on your VPS. **Not Vercel** — its 4.5MB request cap, ephemeral filesystem and request timeouts are hostile to video and long transcriptions. |
| Reverse proxy | Caddy with automatic HTTPS, in front of Next.js. |
| Database / auth / storage | Supabase Cloud free tier. Local Supabase stack stays for development and tests. |
| VPS | 2GB RAM or less, CPU only. This is the binding constraint on the whole design. |
| Transcription | Self-hosted `faster-whisper` (CTranslate2, int8) on the VPS. `base` model by default, configurable. |
| Transcription timing | **Pre-transcribed.** A CPU-only box cannot transcribe live at demo speed. |
| AI | OpenAI API, server-side key only. Never a `NEXT_PUBLIC_` variable. |
| Transcriber swap | `Transcriber` interface with a mock implementation. Satisfies "easy to switch transcriber" and keeps tests hermetic. |
| Moodle | `LmsProvider` interface + `lms_external_id` columns now; real integration later. Embeddable player built in Phase 2. |
| Roles | One global role per user (`student` or `lecturer`). Lecturer signup requires an email allowlist. |
| Enrollment | Both paths ship. **Join code is the demo path and is built first.** CSV roster import follows. Per-student invite links are out of scope. |
| Sign-in | Keep email-code OTP. Add a demo-only quick login, off unless explicitly enabled. |
| Comments | Anchor to a highlight **or** a timestamp range. Visible to everyone in the class. |
| Transcript | Segment rows (~5–15s) with a word-level JSONB array per segment. One read renders a transcript. |
| Captions | Generated WebVTT served from Storage, rendered by native `<track>`. No custom caption component. |
| Video processing | Accept a large upload, then downscale to 720p and compress via ffmpeg in the worker. |
| Analytics sampling | 10s heartbeat plus discrete play/pause/seek/ended, batched client-side. Lecturers see all per-student data. |
| Analytics reads | Aggregated server-side via `security definer` RPCs. Never aggregated in the browser. |

---

## Before we build

These are verification steps, not features. Each one can invalidate a decision above.

1. **Verify Supabase Cloud free-tier limits.** Specifically the per-file upload size limit, total
   storage, monthly egress, and project inactivity/pause behaviour. I have deliberately not
   asserted these numbers. If the per-file limit is small, the "accept a large upload" decision
   may need a chunked or resumable upload path.
2. **Benchmark `faster-whisper` on your actual box.** Install the model, transcribe a 10-minute
   sample, record wall-clock time and peak RSS. This sets the demo clip length cap and confirms
   `base` fits in 2GB alongside Next.js. Do not trust a spec-sheet estimate.
3. **Confirm the VPS has swap enabled** and enough disk for the model plus demo video.
4. **Decide the fate of the starter's `ideas` table.** Recommendation: keep it for now, since its
   owner-only RLS is a useful reference and the integration test exercises it; delete it in a
   final migration once real features are proven. It is currently *your* call — flag it if you
   disagree.
5. **Record the demo lecture.** 10–20 minutes is the realistic target on this hardware. Longer is
   fine for a seed, but not for anything you transcribe on demo day.
6. **Choose the OpenAI model for Phase 2.** Not needed for the demo spine, so it can wait, but the
   cost difference between a small and a large model is worth a decision rather than a default.

---

## Architecture

```text
Browser
  ├─ reads  ──────────────► Next.js Server Components ──► Supabase Cloud (Postgres, Auth, Storage)
  ├─ writes ──► Server Actions (zod-validated, ownership from auth.uid())
  ├─ video upload ────────► signed upload URL ────────► Supabase Storage (direct, bypasses app)
  └─ watch events ──batched──► Server Action ────────► watch_events

VPS (2GB, CPU only)
  ├─ Caddy ──► Next.js (node)
  └─ Whisper worker (Python, polls transcription_jobs, writes results)
```

**Why Postgres is the job queue.** Transcription takes minutes, far longer than any HTTP request
should stay open. Rather than a long-polling request or a new broker, the worker polls a
`transcription_jobs` table using `for update skip locked`. No new infrastructure, survives worker
restarts, and is easy to inspect in Supabase Studio during the demo.

**Why the worker writes results itself.** Having the worker write the `transcripts` row, the WebVTT
file and the lecture status keeps every long-running step off the request path.

**Deliberate deviation from the starter.** The README states there is no service-role client in
app code. The worker needs one to write results and to read source video, so this is an
intentional exception. Constraints: the key exists only in the worker's server-side environment,
never in the Next.js app, never in a `NEXT_PUBLIC_` variable, and never in the browser. If that
cannot be honoured, the fallback is a signed callback from the worker into a Next.js route
handler — slower, but it keeps the app free of elevated credentials.

---

## Data model

Every table follows the starter's existing conventions, which the team should preserve exactly:
`revoke all` from `anon`/`authenticated` followed by narrow grants; column-level `grant update`
so ownership columns are immutable after insert; `(select auth.uid())` wrapping so RLS uses an
initplan rather than re-evaluating per row.

Per `AGENTS.md`, **every table below needs a migration, grants, RLS, and a two-account access
test** before it counts as done.

### Helper functions (`security definer`, locked `search_path`)

Class membership requires reading `class_members` from inside a policy on other tables, which
recurses without encapsulation. These three functions are the only place that logic lives:

- `is_class_member(class_id uuid) -> boolean`
- `is_class_lecturer(class_id uuid) -> boolean`
- `is_lecture_lecturer(lecture_id uuid) -> boolean`

All three derive the caller from `auth.uid()`. **Never** from a parameter, never from submitted
form data.

### Tables

| Table | Purpose | Notes |
|---|---|---|
| `profiles` | `user_id`, `email`, `full_name`, `role` | Role is global. Readable by self **and** by classmates, since comments and analytics show names. |
| `classes` | `title`, `description`, `join_code` (unique), `lecturer_id`, `archived_at` | Lecturer owns it. See the enrollment note below. |
| `class_members` | `(class_id, user_id)` PK, `role`, `joined_at` | Join code inserts here directly. |
| `class_roster` | `class_id`, `email`, `claimed_at?`, `claimed_by?` | Pending enrolment by email. Unique on `(class_id, email)`. Claimed on first sign-in. Backs both CSV import and single-address add. |
| `lectures` | `class_id`, `title`, `source_path`, `video_path`, `duration_ms`, `captions_path`, `status` | `status`: `uploaded → normalizing → transcribing → ready` / `failed`. |
| `transcripts` | `lecture_id`, `language`, `provider`, `model`, `text`, `segments jsonb` | `segments`: `[{index, start_ms, end_ms, text, words:[{w,start_ms,end_ms}]}]`. One row per lecture. |
| `transcription_jobs` | `lecture_id`, `status`, `attempts`, `error`, `claimed_at` | The queue. Service-role only. |
| `highlights` | `lecture_id`, `user_id`, `start_ms`, `end_ms`, `quote`, `segment_indexes` | `quote` keeps the highlight meaningful and survives transcript re-rendering. |
| `comments` | `lecture_id`, `highlight_id?`, `parent_id?`, `author_id`, `body`, `start_ms?`, `end_ms?` | `parent_id` gives threading. |
| `watch_events` | `lecture_id`, `user_id`, `session_id`, `type`, `position_ms`, `duration_ms`, `watched_ms` | High volume. Insert-only. Students insert their own; **not** directly selectable by lecturers. |

### Enrollment: join code and roster

Two committed paths, because they solve different problems. **Join code first** — it is what the
demo uses and it is the smallest useful implementation.

**Join code.** `join_code` is generated server-side: at least 10 characters from an unambiguous
alphabet (excluding `0/O/1/I/l`), stored case-insensitively unique, rotatable by the lecturer, and
never derived from the class title. Displayed in groups for legibility. Entering it inserts a
`class_members` row immediately — no approval step, which is what makes it demo-friendly.

*Security consequence to accept deliberately:* anyone holding the code can enrol. Acceptable for a
demo, and defensible in production only behind rate limiting on the join action and unguessable
codes. A short numeric code is not acceptable.

**CSV roster.** A roster is a list of emails for people who may not have an account yet, so it
cannot write straight into `class_members` — that column references `auth.users`, which does not
exist for an unregistered email. It gets its own table, `class_roster`, and the same table also
backs the single-address "add a student by email" control. Rows are **claimed on first sign-in**:
when a user completes the OTP flow, every unclaimed roster row matching their verified email
becomes a `class_members` row.

This is the same mechanism a future Moodle sync would push into, which is why it is worth doing
now rather than as a throwaway CSV parser.

*Assumption to confirm:* a roster row for an email that never signs in stays unclaimed and is
counted as "pending" in the roster UI, not as a class member. It should not appear in the student
list, in the analytics dashboard, or anywhere a member count is shown.

*CSV parsing rules:* header row optional; one email per line; trim and lowercase, matching
`emailSchema`; skip blanks and `#` comments; cap the file at 500 rows; report per-row outcomes
(added, already a member, already pending, invalid) rather than failing the whole import on one bad
address. Re-uploading the same file is idempotent.

### RLS rules

Applied uniformly, so individual policies stay short:

- **Read:** any member of the owning class. `profiles` is readable by self and by classmates,
  because comments and the analytics dashboard show names.
- **Write:** the owning user, with ownership columns immutable after insert. This is the starter's
  column-level `grant update` pattern applied to `user_id`, `class_id` and `lecture_id`.
- **Lecture mutations:** the class lecturer only. A student in the class cannot edit or delete a
  lecture, its transcript, or its captions.
- **Comments and highlights:** any class member may insert their own; authors may edit or delete
  their own. No member may edit another author's rows.
- **`class_roster`:** the class lecturer manages it (insert, delete, view). **A student may read
  only their own row**, so that claiming on sign-in can find it — and nothing else. A student must
  not be able to enumerate the roster, or the class's roster becomes readable to any student.
- **Claiming on sign-in:** runs inside the verified-authentication path and matches on the email
  from the verified session claim only. Never on a submitted or client-supplied email.
- **Service-role tables:** `transcription_jobs` is not exposed to `anon` or `authenticated` at
  all; the worker only.
- **`watch_events`:** insert-own only. No student or lecturer reads the table directly.

### Analytics reads

`watch_events` is deliberately not readable by lecturers through the API. Aggregates go through
`security definer` RPCs (`lecture_engagement`, `lecture_drop_off`, `lecture_completion`) that each
verify `is_lecture_lecturer(lecture_id)` before returning. This is required, not stylistic: the
API caps responses at 1000 rows, and one lecture at 10s heartbeats across 30 students is roughly
10,800 events.

**"Average watch percentage" means unique coverage** — distinct seconds watched divided by
duration — not total play time. Replaying the same minute must not inflate the number.

---

## Implementation order

Each phase ends with a working demo, not a partial layer. `AGENTS.md`: prefer one complete
feature over layers of abstractions.

### Phase 0 — Foundations

- Benchmark Whisper on the box; verify Supabase free-tier limits.
- Enable Supabase Storage in local `supabase/config.toml` (currently `enabled = false`) so dev
  matches production.
- Add new env vars to `.env.example` with public placeholders only.
- Extend `lib/validation.ts` with schemas for classes, lectures, highlights, comments, events.
- Set up the VPS: Caddy, Node 22, Python, ffmpeg, swap. Add `output: "standalone"` to
  `next.config.ts` so the Node server runs without bundling `node_modules`.
- Restructure the integration test so it is not coupled to the `/ideas` demo. It currently asserts
  exact strings (`"A blank page."`, `"Idea added."`) and that `/ideas` 307s to `/login`. Building
  the real app breaks it, and CI runs it.
- Demo accounts: a seed script creating one lecturer and a handful of students, with passwords set
  server-side so the quick-login path has real credentials to use. Must be idempotent and must
  refuse to run against a production database.

### Phase 1 — Identity and classes

- Migration: `profiles`, `classes`, `class_members`, `class_roster`, the three helper functions.
- Role chosen at signup; lecturer path checks the allowlist env var.
- Lecturer creates/edits a class and shares a join code.
- Student signs up and joins with a code. **This is the demo path — build and verify it first.**
- Lecturer can add a single student by email, writing to `class_roster`.
- Roster claiming on sign-in: matching unclaimed rows become `class_members` rows, using the
  verified session email only.
- Demo quick login: env-gated, default off, server-side real password auth (not an auth bypass),
  loud startup warning when enabled, and a test asserting it stays off when unset.
- `LmsProvider` interface and `lms_external_id` columns.

### Phase 2 — Upload, transcription, player

- Storage bucket and signed upload URLs from a Server Action. Uploads bypass the app server.
- Migration: `lectures`, `transcripts`, `transcription_jobs`.
- Worker: ffmpeg normalise to 720p + compressed MP4, then `faster-whisper` with VAD and
  word-level timestamps. Writes Storage + `transcripts` + status.
- WebVTT generation from the segments.
- Player: video, transcript that follows along, native captions, click-to-seek.
- Embeddable player mode for later Moodle use.
- **Full seed script.** Uploads the recorded lecture, runs it through the worker, and inserts a
  realistic transcript, captions, a few highlights and comment threads. The demo must never depend
  on transcribing live. Idempotent, local-or-Cloud only, and it must refuse to run against a
  production database without an explicit override.

### Phase 3 — Highlights and comments

- Migration: `highlights`, `comments`.
- Select transcript text to highlight, or highlight a timestamp range with no selection.
- Comment threads with replies; jump video to a highlight or comment.
- Visibility: all students in the class plus the class lecturer.

### Phase 4 — Analytics

- Migration: `watch_events`.
- Client sampler: 10s heartbeat while playing, plus play/pause/seek/ended, batched and flushed on
  pause, on `visibilitychange`, and on unload.
- RPC aggregates.
- Lecturer dashboard: view count, unique students, average watch %, drop-off curve, per-student
  completion.
- **Seeded watch history.** A brand-new dashboard is empty, which makes for a poor demo. The seed
  script must synthesise plausible events for the seeded lecture and students, including a clear
  drop-off around 20 minutes and at least one student well below complete, so every chart has
  something to show. The seed must produce the same aggregates the RPCs compute, which doubles as
  a correctness check on the aggregation logic.
- Retention: `watch_events` grows without bound. Decide a retention window and a delete job. The
  `open` and `heartbeat` types are the bulk and are candidates for aggressive pruning; `completed`
  and drop-off summaries are worth keeping longer.

### Phase 5 — Phase 2 features

CSV roster import (a committed deliverable, not optional — the table and claiming mechanism are
built in Phase 1, so this phase is only the upload-and-parse UI), AI overview, class-wide AI Q&A
(start with keyword search, add pgvector later), real Moodle wiring.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| 2GB box OOM during the demo | Total failure | Pre-transcribe; cap worker concurrency to 1; enable swap; keep `base` model; monitor RSS |
| Supabase free tier pauses an inactive project | Total failure on demo day | Check project activity shortly before the demo; keep the project active beforehand |
| Per-file upload limit lower than expected | Upload fails | Verify before Phase 2; chunked upload fallback if needed |
| Transcription slower than hoped | Demo stalls | Pre-transcribe and seed; never transcribe live |
| 1GB storage cap | Upload fails late in rehearsal | Store one normalised copy; delete source files after normalisation |
| Quick login left enabled on a public URL | Anyone signs in as a demo user | Env-gated, off by default, startup warning, test; remove before any public exposure |
| RLS regression as tables multiply | Data leak between classes | Two-account test per table, per `AGENTS.md`; extend the integration test as each phase lands |
| Word-level data bloat | Slow transcript page | Segments + JSONB, one read; do not create a row per word |
| Domain/HTTPS not ready | Broken cookies, awkward demo | Caddy with automatic HTTPS; IP-over-HTTP fallback documented |
| OpenAI key missing | Phase 2 blocked only | Mock provider; the demo spine never calls OpenAI |

---

## Standing constraints

From `AGENTS.md`, unchanged and binding:

- pnpm, TypeScript strict, App Router, Tailwind v4. Reads in Server Components, writes in Server
  Actions, small Client Components for interactive forms.
- Validate every action input. Derive ownership from verified authentication only.
- Never commit `.env.local`, credentials, tokens or keys. Public placeholders in `.env.example`.
- Tests use only the dedicated local database. Never reset a linked or production database.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm test:integration` must pass.
- No paid services or production projects without the owner's approval. (OpenAI is approved;
  Supabase Cloud free tier is approved.)

Design stays functional and clean. Not a priority this cycle.
