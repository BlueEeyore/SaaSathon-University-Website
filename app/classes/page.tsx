import Link from "next/link";
import { BookOpen, Clock3, GraduationCap, Plus, UsersRound } from "lucide-react";
import { BrandWordmark } from "@/components/brand-wordmark";
import { requireUser } from "@/lib/auth";
import { isConfigured } from "@/lib/config";
import { redirect } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { CreateClassForm, JoinClassForm } from "@/components/class-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Tables } from "@/lib/database.types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your classes" };

type ClassRow = Tables<"classes">;

export default async function ClassesPage() {
  if (!isConfigured()) redirect("/login");
  const { supabase, userId, email } = await requireUser();
  const { data: profile, error: profileError } = await supabase.from("profiles").select("full_name, role").eq("user_id", userId).single();
  if (profileError || !profile) throw new Error("We couldn’t load your account. Please sign in again.");

  let classes: ClassRow[] = [];
  if (profile.role === "lecturer") {
    const { data, error } = await supabase.from("classes").select("*").eq("lecturer_id", userId).is("archived_at", null).order("created_at", { ascending: false });
    if (error) throw new Error("We couldn’t load your classes.");
    classes = data;
  } else {
    const { data: memberships, error: membershipError } = await supabase.from("class_members").select("class_id").eq("user_id", userId);
    if (membershipError) throw new Error("We couldn’t load your classes.");
    const ids = memberships.map((membership) => membership.class_id);
    if (ids.length) {
      const { data, error } = await supabase.from("classes").select("*").in("id", ids).is("archived_at", null).order("created_at", { ascending: false });
      if (error) throw new Error("We couldn’t load your classes.");
      classes = data;
    }
  }

  const counts = await Promise.all(classes.map(async (classItem) => {
    const { count } = await supabase.from("class_members").select("user_id", { count: "exact", head: true }).eq("class_id", classItem.id).eq("role", "student");
    return [classItem.id, count ?? 0] as const;
  }));
  const studentCounts = new Map(counts);
  const isLecturer = profile.role === "lecturer";
  const displayName = profile.full_name.trim() || email.split("@")[0] || "there";

  return <div className="min-h-screen bg-[#f5f8fb]">
    <header className="sticky top-0 z-20 border-b border-black/[0.06] bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link href="/classes" className="flex items-center gap-2.5 font-semibold tracking-tight"><BrandWordmark /></Link>
        <div className="flex items-center gap-3"><span className="hidden text-sm text-muted-foreground sm:block">{email}</span><span className="flex size-9 items-center justify-center rounded-full bg-[#eaf3fb] text-xs font-semibold text-[#1f70b7]">{displayName.slice(0, 1).toUpperCase()}</span><form action={signOut}><Button variant="ghost" size="sm" type="submit">Sign out</Button></form></div>
      </div>
    </header>
    <main id="main" className="mx-auto max-w-7xl px-5 pb-20 pt-10 sm:px-8 sm:pt-14">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div><p className="text-sm font-medium text-[#1f70b7]">{isLecturer ? "LECTURER SPACE" : "STUDENT SPACE"}</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-[40px]">Good to see you, {displayName.split(" ")[0]}.</h1><p className="mt-2 text-sm text-muted-foreground sm:text-base">{isLecturer ? "Your classes and everything happening in them." : "Pick up where you left off, or join a new class."}</p></div>
        <Badge variant="green" className="rounded-full px-3 py-1.5"><GraduationCap className="size-3.5" />{isLecturer ? "Lecturer" : "Student"}</Badge>
      </div>

      {isLecturer ? <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_350px]">
        <section>
          <div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-semibold tracking-tight">Your classes</h2><p className="mt-1 text-sm text-muted-foreground">Manage your course spaces and invite students.</p></div><Badge variant="secondary">{classes.length} {classes.length === 1 ? "class" : "classes"}</Badge></div>
          {classes.length ? <div className="grid gap-4 md:grid-cols-2">{classes.map((item, index) => <Link key={item.id} href={`/classes/${item.id}`} className="group"><Card className="h-full transition-all hover:-translate-y-0.5 hover:border-[#b7d5ef] hover:shadow-md"><div className={`h-1.5 rounded-t-2xl ${index % 3 === 0 ? "bg-[#70ade3]" : index % 3 === 1 ? "bg-[#b7d5ef]" : "bg-[#8bb9e2]"}`} /><CardHeader className="pb-3"><div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-[#eaf3fb] text-[#1f70b7]"><BookOpen className="size-5" /></div><CardTitle className="text-base group-hover:text-[#1f70b7]">{item.title}</CardTitle><CardDescription className="line-clamp-2 min-h-10">{item.description || "Your course space is ready for its first lecture."}</CardDescription></CardHeader><CardContent className="flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><UsersRound className="size-3.5" />{studentCounts.get(item.id) ?? 0} students</span><span className="flex items-center gap-1.5"><Clock3 className="size-3.5" />Created {new Date(item.created_at).toLocaleDateString("en", { month: "short", day: "numeric" })}</span></CardContent></Card></Link>)}</div> : <Card className="border-dashed shadow-none"><CardContent className="flex min-h-64 flex-col items-center justify-center text-center"><span className="flex size-14 items-center justify-center rounded-2xl bg-[#eaf3fb] text-[#1f70b7]"><BookOpen className="size-6" /></span><h3 className="mt-4 font-semibold">Your first class starts here</h3><p className="mt-1 max-w-sm text-sm text-muted-foreground">Create a class and share its join code with students. You can add lectures next.</p></CardContent></Card>}
        </section>
        <aside className="lg:pt-1"><Card><CardHeader><div className="flex size-10 items-center justify-center rounded-xl bg-[#dceeff] text-[#1f70b7]"><Plus className="size-5" /></div><CardTitle className="mt-2">Create a class</CardTitle><CardDescription>Set up a new course space for your students.</CardDescription></CardHeader><CardContent><CreateClassForm /></CardContent></Card></aside>
      </div> : <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_350px]">
        <section><div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-semibold tracking-tight">Your classes</h2><p className="mt-1 text-sm text-muted-foreground">Lectures and discussions from your courses.</p></div><Badge variant="secondary">{classes.length} {classes.length === 1 ? "class" : "classes"}</Badge></div>
          {classes.length ? <div className="grid gap-4 md:grid-cols-2">{classes.map((item, index) => <Link key={item.id} href={`/classes/${item.id}`} className="group"><Card className="h-full transition-all hover:-translate-y-0.5 hover:border-[#b7d5ef] hover:shadow-md"><div className={`h-1.5 rounded-t-2xl ${index % 3 === 0 ? "bg-[#70ade3]" : index % 3 === 1 ? "bg-[#b7d5ef]" : "bg-[#8bb9e2]"}`} /><CardHeader className="pb-3"><div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-[#eaf3fb] text-[#1f70b7]"><BookOpen className="size-5" /></div><CardTitle className="text-base group-hover:text-[#1f70b7]">{item.title}</CardTitle><CardDescription className="line-clamp-2 min-h-10">{item.description || "Your course space is ready for its first lecture."}</CardDescription></CardHeader><CardContent className="flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><UsersRound className="size-3.5" />{studentCounts.get(item.id) ?? 0} students</span><span>Open class <span aria-hidden="true">↗</span></span></CardContent></Card></Link>)}</div> : <Card className="border-dashed shadow-none"><CardContent className="flex min-h-64 flex-col items-center justify-center text-center"><span className="flex size-14 items-center justify-center rounded-2xl bg-[#eaf3fb] text-[#1f70b7]"><BookOpen className="size-6" /></span><h3 className="mt-4 font-semibold">No classes yet</h3><p className="mt-1 max-w-sm text-sm text-muted-foreground">Join a class with the code from your lecturer to see its lectures here.</p></CardContent></Card>}
        </section>
        <aside className="lg:pt-1"><Card><CardHeader><div className="flex size-10 items-center justify-center rounded-xl bg-[#dceeff] text-[#1f70b7]"><UsersRound className="size-5" /></div><CardTitle className="mt-2">Join a class</CardTitle><CardDescription>Enter the 10-character code shared by your lecturer.</CardDescription></CardHeader><CardContent><JoinClassForm /></CardContent></Card></aside>
      </div>}
      <footer className="mt-16 border-t border-black/[0.06] pt-5 text-xs text-muted-foreground">HighlightEd · Your learning, in context</footer>
    </main>
  </div>;
}
