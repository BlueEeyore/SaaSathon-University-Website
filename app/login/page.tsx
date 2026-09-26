import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpenCheck, Captions, MessageSquareText } from "lucide-react";
import { BrandWordmark } from "@/components/brand-wordmark";
import { Button } from "@/components/ui/button";
import { signInWithGoogle } from "@/app/login/actions";
import { isConfigured } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

const features = [
  { icon: Captions, label: "Follow a lecture with live transcripts" },
  { icon: MessageSquareText, label: "Share questions at the exact moment" },
  { icon: BookOpenCheck, label: "Keep every class in one place" },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const configured = isConfigured();
  if (configured) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (data?.claims.sub) redirect("/classes");
  }
  const params = await searchParams;
  return (
    <main id="main" className="min-h-screen bg-[#f5f8fb]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight"><BrandWordmark /></Link>
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Back to home</Link>
      </header>
      <div className="mx-auto grid min-h-[calc(100vh-88px)] max-w-7xl items-center gap-12 px-5 pb-12 pt-4 sm:px-8 lg:grid-cols-[1fr_0.85fr] lg:gap-20">
        <section className="hidden lg:block">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#1f70b7]">LEARN IN CONTEXT</p>
          <h1 className="max-w-xl text-5xl font-semibold leading-[1.06] tracking-[-0.05em] text-[#142435] xl:text-6xl">Every lecture,<br />a little clearer.</h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-muted-foreground">Watch, read, and discuss your course material in one calm space built for learning.</p>
          <div className="mt-12 space-y-5">
            {features.map(({ icon: Icon, label }) => <div key={label} className="flex items-center gap-3 text-sm font-medium text-[#35495c]"><span className="flex size-9 items-center justify-center rounded-xl bg-[#eaf3fb] text-[#1f70b7]"><Icon className="size-4" /></span>{label}</div>)}
          </div>
          <div className="relative mt-14 max-w-xl overflow-hidden rounded-[28px] bg-[#dceeff] p-8">
            <div className="absolute -right-10 -top-16 size-64 rounded-full border-[1px] border-[#b7d5ef]" />
            <div className="absolute -right-2 -top-8 size-48 rounded-full border-[1px] border-[#b7d5ef]" />
            <div className="relative flex items-end justify-between">
              <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1f70b7]">YOUR COURSE SPACE</p><p className="mt-2 text-xl font-semibold tracking-tight text-[#142435]">Learn at your own pace.</p></div>
              <div className="flex size-12 items-center justify-center rounded-2xl bg-white/80 text-[#1f70b7]"><BookOpenCheck className="size-5" /></div>
            </div>
          </div>
        </section>
        <section className="mx-auto w-full max-w-md rounded-[28px] border border-black/[0.06] bg-white p-7 shadow-[0_20px_70px_-35px_rgba(23,42,30,0.22)] sm:p-10">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-[#dceeff] text-[#1f70b7]"><BookOpenCheck className="size-5" /></span>
          <h2 className="mt-7 text-2xl font-semibold tracking-tight">Welcome to HighlightEd</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Sign in with your university Google account to continue.</p>
          {configured ? (
            <form action={signInWithGoogle} className="mt-8">
              <Button type="submit" variant="outline" size="xl" className="w-full rounded-xl border-[#d1deea] font-semibold shadow-none hover:bg-[#f5f8fb]">
                <GoogleMark /> Continue with Google
              </Button>
              {params.error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">Google sign-in could not start. Check that Google is enabled in your Supabase authentication settings, then try again.</p>}
            </form>
          ) : (
            <div role="status" className="mt-8 rounded-xl border border-[#d9e7f2] bg-[#f5f8fb] px-4 py-4 text-sm leading-6 text-[#35495c]">
              <p className="font-semibold text-[#142435]">Google sign-in isn’t configured on this computer yet.</p>
              <p className="mt-1">Start local Supabase, add its URL and publishable key to <code className="rounded bg-white px-1 py-0.5">.env.local</code>, and configure Google OAuth in the project’s root <code className="rounded bg-white px-1 py-0.5">.env</code>. See the local setup steps in README.md, then restart the app.</p>
            </div>
          )}
          <p className="mt-7 text-center text-xs leading-5 text-muted-foreground">Your course account is managed by your university. Ask your lecturer if you need access to a class.</p>
        </section>
      </div>
    </main>
  );
}

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[18px]"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.09-1.92 3.27-4.75 3.27-8.1Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.15v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.84 14.11A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.11V7.05H2.15A11 11 0 0 0 1 12c0 1.78.43 3.46 1.15 4.95l3.69-2.84Z"/><path fill="#EA4335" d="M12 5.36c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 0 0-9.85 6.05l3.69 2.84C6.71 7.29 9.14 5.36 12 5.36Z"/></svg>;
}
