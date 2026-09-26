import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, BookOpen, Captions, Clock3, FileVideo2, MessageSquareText, Upload, UsersRound } from "lucide-react";
import { BrandWordmark } from "@/components/brand-wordmark";
import { requireUser } from "@/lib/auth";
import { isConfigured } from "@/lib/config";
import { signOut } from "@/app/login/actions";
import { CopyCodeButton } from "@/components/copy-code-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { idSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const upcoming = [
  { icon: Captions, title: "A transcript that follows along", text: "Read and listen without losing your place." },
  { icon: MessageSquareText, title: "Questions in context", text: "Discuss a moment with everyone in class." },
];

export default async function ClassPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isConfigured()) redirect("/login");
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const { supabase, userId, email } = await requireUser();
  const { data: classItem, error } = await supabase.from("classes").select("*").eq("id", id).single();
  if (error || !classItem) notFound();

  const { data: currentMembership } = await supabase.from("class_members").select("role").eq("class_id", id).eq("user_id", userId).maybeSingle();
  if (!currentMembership) notFound();
  const isLecturer = currentMembership.role === "lecturer";
  const { data: members, count } = await supabase.from("class_members").select("user_id, role", { count: "exact" }).eq("class_id", id).eq("role", "student").order("joined_at", { ascending: true }).limit(8);
  const { data: profiles } = isLecturer && members?.length
    ? await supabase.from("profiles").select("user_id, full_name, email").in("user_id", members.map((member) => member.user_id))
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));

  return <div className="min-h-screen bg-[#f5f8fb]">
    <header className="sticky top-0 z-20 border-b border-black/[0.06] bg-white/90 backdrop-blur-xl"><div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 sm:px-8"><Link href="/classes" className="flex items-center gap-2.5 font-semibold tracking-tight"><BrandWordmark /></Link><div className="flex items-center gap-3"><span className="hidden text-sm text-muted-foreground sm:block">{email}</span><form action={signOut}><Button variant="ghost" size="sm" type="submit">Sign out</Button></form></div></div></header>
    <main id="main" className="mx-auto max-w-7xl px-5 pb-20 pt-8 sm:px-8">
      <Link href="/classes" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"><ArrowLeft className="size-4" />All classes</Link>
      <section className="relative mt-6 overflow-hidden rounded-[28px] bg-[#2786d7] px-6 py-8 text-white sm:px-10 sm:py-11"><div aria-hidden="true" className="absolute -right-10 -top-32 size-96 rounded-full border border-white/10" /><div aria-hidden="true" className="absolute -right-1 -top-24 size-72 rounded-full border border-white/10" /><div className="relative flex flex-col justify-between gap-8 sm:flex-row sm:items-end"><div className="max-w-2xl"><Badge className="border-white/15 bg-white/10 text-white">{isLecturer ? "Your class" : "Course space"}</Badge><h1 className="mt-5 text-3xl font-semibold tracking-[-0.04em] sm:text-[42px]">{classItem.title}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-white/70">{classItem.description || "A shared space for lectures, questions, and learning together."}</p></div><div className="flex items-center gap-2 text-sm text-white/75"><UsersRound className="size-4" />{count ?? 0} students</div></div></section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_330px]">
        <section>
          <div className="mb-4 flex items-end justify-between"><div><h2 className="text-lg font-semibold tracking-tight">Lecture library</h2><p className="mt-1 text-sm text-muted-foreground">Watch, read, and discuss your course recordings.</p></div>{isLecturer && <Button disabled><Upload />Upload lecture</Button>}</div>
          <Card className="border-dashed shadow-none"><CardContent className="flex min-h-[330px] flex-col items-center justify-center px-6 py-12 text-center"><span className="flex size-14 items-center justify-center rounded-2xl bg-[#eaf3fb] text-[#1f70b7]"><FileVideo2 className="size-6" /></span><h3 className="mt-5 text-base font-semibold">Your lecture library is ready</h3><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{isLecturer ? "Upload and transcribe your first lecture to give students a place to start." : "Your lecturer has not added a recording yet. New lectures will appear here."}</p>{isLecturer && <Badge variant="secondary" className="mt-5"><Clock3 className="size-3.5" />Lecture uploads are coming next</Badge>}</CardContent></Card>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">{upcoming.map(({ icon: Icon, title, text }) => <Card key={title} className="shadow-none"><CardContent className="flex gap-3 p-4"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#eaf3fb] text-[#1f70b7]"><Icon className="size-4" /></span><div><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></div></CardContent></Card>)}</div>
        </section>

        <aside className="space-y-5">
          {isLecturer && <Card><CardHeader className="pb-4"><CardTitle className="text-sm">Invite students</CardTitle><CardDescription>Share this code so students can join your class.</CardDescription></CardHeader><CardContent><div className="flex items-center justify-between gap-2 rounded-xl bg-[#f5f8fb] p-3"><code className="text-base font-semibold tracking-[0.15em] text-[#2786d7]">{classItem.join_code.match(/.{1,5}/g)?.join(" ")}</code><CopyCodeButton code={classItem.join_code} /></div><p className="mt-3 text-xs leading-5 text-muted-foreground">Anyone with this code can join. Share it with your students directly.</p></CardContent></Card>}
          <Card><CardHeader className="pb-3"><CardTitle className="text-sm">People in this class</CardTitle><CardDescription>{count ?? 0} students{isLecturer ? " enrolled" : " learning together"}</CardDescription></CardHeader>{isLecturer && <CardContent className="space-y-3">{members?.length ? members.map((member) => { const person = profileMap.get(member.user_id); const name = person?.full_name || person?.email || "Student"; return <div key={member.user_id} className="flex items-center gap-3"><span className="flex size-8 items-center justify-center rounded-full bg-[#eaf3fb] text-xs font-semibold text-[#1f70b7]">{name.slice(0, 1).toUpperCase()}</span><span className="truncate text-sm">{name}</span></div>; }) : <p className="text-sm text-muted-foreground">Students will appear here when they join.</p>}{(count ?? 0) > 8 && <p className="pt-1 text-xs text-muted-foreground">And {(count ?? 0) - 8} more</p>}</CardContent>}</Card>
          <div className="rounded-2xl border border-[#c5def3] bg-[#eaf3fb] p-5"><div className="flex size-9 items-center justify-center rounded-xl bg-white text-[#1f70b7]"><BookOpen className="size-4" /></div><p className="mt-3 text-sm font-medium text-[#2786d7]">A shared space to learn</p><p className="mt-1 text-xs leading-5 text-[#526779]">Everyone in this class can learn from recordings and join the discussion.</p></div>
        </aside>
      </div>
      <footer className="mt-16 border-t border-black/[0.06] pt-5 text-xs text-muted-foreground">HighlightEd · {classItem.title}</footer>
    </main>
  </div>;
}
