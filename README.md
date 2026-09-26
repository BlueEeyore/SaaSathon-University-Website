# HighlightEd — Lecture Capture

**A shared space for lectures, transcripts, and class discussion.**

HighlightEd is a lecture-capture app built with Next.js, TypeScript, Supabase, and shadcn/ui. Lecturers create classes, upload recordings, and share a join code; students join their class spaces and follow lectures with transcripts and captions. Discussion and analytics are the next product slices.

[SaaSathon](https://www.saasathon.dev) · [Project plan](PLAN.md) · [Session handoff](HANDOFF.md)

## What you get

- Next.js App Router and React Server Components for reads; Server Actions for writes.
- Google OAuth sign-in through Supabase Auth.
- Lecturer and student class dashboards, lecturer class creation, and student enrollment by join code.
- Large lecture uploads streamed to local disk, with asynchronous ffmpeg/faster-whisper processing, authenticated playback, transcript seeking, and captions.
- Class membership and lecturer permissions enforced by Postgres row-level security and database functions.
- Accessible labels, keyboard focus, semantic forms and confirmation before deletion.
- Typed Supabase clients, explicit grants, row-level security and class access functions.
- Tailwind v4 and shadcn/ui components with the HighlightEd visual theme.
- A lockfile, CI, a local integration test and Vercel configuration.

Google OAuth credentials are configured in local Supabase, not in the browser app. A separate setup is required for a future hosted deployment.

## 1. Make a repository

Choose **Use this template → Create a new repository** on GitHub, then clone **your new repository**.

You need Node.js 22+, pnpm 10 and Docker for local Supabase. The Supabase CLI is pinned as a development dependency, so every command below uses `pnpm`.

```sh
cd your-repository
pnpm install
cp .env.example .env.local
```

Real environment files are ignored by Git. Never paste service-role keys, private keys or database passwords into frontend variables. The app only needs a **publishable key** (the legacy local `anon` key also works).

## 2. Start the local database

With Docker running:

```sh
pnpm db:start
pnpm supabase status
```

Copy the displayed API URL and **publishable key** into `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55431
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-local-publishable-key
```

The first start downloads images and applies the migration automatically. Local ports are intentionally separate from Supabase's defaults:

| Service     | Address                |
| ----------- | ---------------------- |
| API         | http://127.0.0.1:55431 |
| Postgres    | localhost:55432        |
| Studio      | http://127.0.0.1:55433 |
| Email inbox | http://127.0.0.1:55434 |

The local stack provides the database and auth service. Google OAuth credentials are read by local Supabase from the ignored project-root `.env` file; never commit or share the client secret.

Each developer needs their own local Supabase configuration because `.env` and `.env.local` are intentionally not in Git. After `pnpm db:start`, run `pnpm supabase status` and put the displayed API URL and publishable key in `.env.local` (replace the example values). The Google button is hidden until those two public values are valid; the sign-in page now explains this when they are missing.

To enable Google on that developer’s local Supabase:

1. Create a Google OAuth 2.0 Web application client in Google Cloud Console, or use credentials your team has explicitly shared through a secure channel. Add `http://127.0.0.1:55431/auth/v1/callback` as an authorized redirect URI. If Google shows the consent screen in testing mode, add the developer’s Google account as a test user.
2. Copy `supabase-auth.env.example` to the project-root `.env` if they do not already have one, then replace both placeholders with the OAuth client ID and secret. Keep `.env` private and out of Git.
3. Restart local Supabase (`pnpm supabase stop`, then `pnpm db:start`) and restart `pnpm dev` after updating `.env.local`. Open `http://localhost:3000/login` and try Google sign-in.

Every local copy has its own database and users. Migrations apply when the developer starts their local Supabase stack; lecturer allowlist entries and class data do not copy from another developer’s machine.

To recreate **only this local database** from the migration:

```sh
pnpm db:reset
```

This removes local users and ideas. It explicitly uses `--local`; never run a reset against a linked production project. When you finish local development, `pnpm supabase stop` stops this starter's stack and preserves its data. If these ports or the project ID are already in use, change `supabase/config.toml` before starting another copy; don't stop someone else's stack.

## 3. Run the app

```sh
pnpm dev
```

Open [localhost:3000](http://localhost:3000). Configure Google under Supabase Authentication → Providers and add `http://localhost:3000/auth/callback` to the allowed redirect URLs. Sign in with an allowlisted lecturer email to create classes; other accounts join with a lecturer's 10-character code.

If another app uses port 3000, use `pnpm dev --port 3100`. Never replace an existing dev server. Restart your own app after changing public environment variables.

## 4. Upload and transcribe a lecture

Lecturer accounts can upload MP4, MOV, or WebM videos up to 2 GB and 60 minutes. Videos are streamed to the ignored `media/` directory on this machine, normalized to MP4, then transcribed locally. Supabase stores only lecture metadata, transcript text, and word timings.

Create the Python environment and install the worker if this machine does not already have it:

```sh
python3 -m venv .venv-whisper
./.venv-whisper/bin/pip install -r workers/whisper/requirements.txt
```

Create a gitignored `.env.worker` file with the local service-role key shown by `pnpm supabase status`. This keeps the key out of the Next.js server environment as well as the browser. Never add it to `.env.local`, a `NEXT_PUBLIC_*` variable, or a commit:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55431
WORKER_SUPABASE_SERVICE_ROLE_KEY=your-local-service-role-key
MEDIA_ROOT=./media
TRANSCRIBER_MODEL=base
```

Keep this file on the local demo machine only. `MEDIA_ROOT` can stay `./media` for a local demo.

Run the worker in its own terminal:

```sh
pnpm worker:whisper
```

Keep that terminal running while you use the app. The upload appears in the class immediately; the worker then converts it, creates the transcript and captions, and marks it ready to watch. Processing can take several minutes on this computer.

Lecturers can cancel while a video is uploading, queued, being prepared, or transcribed. Cancelling removes it from the class and deletes its local video files; the worker stops its active processing stage and cleans up temporary files.

The upload handler checks the container and duration with `ffprobe`, requires an audio track, streams to a temporary file, and only registers the lecture after the upload succeeds. Students can read lectures only in classes they have joined.

Without environment configuration, the app shows setup guidance instead of a broken sign-in flow.

## 5. Deploy your version

Use a Supabase project dedicated to **your app**, never the SaaSathon event database. Creating hosted projects can have costs; use your team's approved account and plan.

1. In your Supabase project, open **Connect** and copy the project URL and publishable key.
2. Apply the migration to your empty app database. Either run its SQL in Supabase's SQL editor, **or** use the CLI:

   ```sh
   pnpm supabase login
   pnpm supabase link --project-ref YOUR_PROJECT_REF
   pnpm supabase db push
   ```

   Check the target project before confirming. `db push` applies pending migrations; it does not reset the database.

3. In **Authentication → Providers**, enable Google with your Google OAuth client ID and secret. Add `https://YOUR_PROJECT.supabase.co/auth/v1/callback` to Google's authorized redirect URIs, and add your app URL plus `/auth/callback` to Supabase's allowed redirect URLs.
4. Add lecturer emails to `public.lecturer_allowlist`. Only those accounts receive lecturer access after Google sign-in.
5. In Vercel, **Add New → Project**, import your repository and choose Next.js. Keep the repository root as the root directory. Select Node.js 22 or newer. `vercel.json` supplies install/build commands.
6. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_SITE_URL` to Production. Use a separate test project for Preview when appropriate. Public variables are embedded at build time; redeploy after changing them.
7. Deploy and set Supabase's **Authentication → URL Configuration → Site URL** to the deployed HTTPS URL. Add the deployed `/auth/callback` URL to the allowed redirect URLs.
8. Verify on the deployed URL: sign in with an allowlisted lecturer, create a class, join as a student with its code, and confirm students cannot create classes.

Vercel supplies HTTPS and deployments from Git. No custom server, cron or extra hosting service is required. A successful build is not proof that Google OAuth and database permissions work: complete step 8 for your own project.

## Verify changes

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
# With this starter's local Supabase stack running:
pnpm test:integration
```

The integration test refuses remote Supabase URLs. It creates and cleans up temporary local users, checks class access rules, and exercises the protected dashboard and class create/join actions over HTTP. OAuth itself requires provider credentials and is configured outside the local test stack.

CI runs the same checks on a fresh Linux runner. Browser interaction and visual QA remain a separate check; the HTTP test does not simulate a browser.

## Find your way around

```text
app/
  page.tsx                 HighlightEd landing page
  login/                   Google OAuth sign-in
  auth/callback/           Supabase OAuth callback
  classes/                 Protected dashboard and class detail
  error.tsx                Recoverable error boundary
components/
  ui/                      shadcn-style shared components
  class-actions.tsx        Small interactive class forms
lib/
  auth.ts                  Verified identity for protected actions
  config.ts                Validated public configuration
  validation.ts            Input schemas shared by actions and tests
  database.types.ts        Generated database types
  supabase/                Browser and server cookie clients
proxy.ts                   Session refresh; private/no-store response
supabase/
  config.toml              Isolated local development configuration
  migrations/              Reproducible schema and access policies
  templates/               Local and hosted email-code template
scripts/test-integration.ts Local-only database and HTTP verification
```

## Extend it

Keep the next feature just as small: a table, one migration, a protected read and a validated mutation.

1. Create a migration with `pnpm supabase migration new your_feature`.
2. Add constraints, explicit grants and RLS alongside the table. Derive owner IDs from verified authentication, never submitted form values. Use membership policies for shared data.
3. Apply locally with `pnpm db:reset` (destructive to local data), then regenerate types with `pnpm db:types`.
4. Keep database reads in Server Components and writes in Server Actions. Mark server-only modules with `server-only`; do not import them into Client Components. The browser client is available for a feature that needs subscriptions or uploads.
5. Validate inputs before calling the database, return useful errors and test access using two accounts. The publishable key is public: RLS must protect direct API access too.
6. Reuse `components/ui` and `app/globals.css` tokens. Use black text on the brand blue; keep readable contrast, keyboard focus and mobile layouts.

The generated Supabase types mirror database columns; database grants still prevent changing `user_id` or `created_at` after insertion. No service-role client exists in app code; the integration test uses a local admin client only to create and remove test users.

## Documentation and licences

Implementation references: [Supabase SSR clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-login/auth-google), [row-level security](https://supabase.com/docs/guides/auth/row-level-security), [local CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), [Next.js on Vercel](https://vercel.com/docs/frameworks/nextjs).

Code: [MIT](LICENSE). Inter: SIL Open Font License, distributed by Fontsource. See [third-party notices](THIRD_PARTY_NOTICES.md). The commercial ABC Camera typeface and Lumin artwork are intentionally not distributed with this template.
