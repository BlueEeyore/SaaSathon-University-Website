"use client";

import { useActionState } from "react";
import { ArrowRight, Plus, UsersRound } from "lucide-react";
import { createClass, joinClass } from "@/app/classes/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function CreateClassForm() {
  const [state, action, pending] = useActionState(createClass, {});
  return <form action={action} className="space-y-4">
    <div className="space-y-2"><label htmlFor="class-title" className="text-sm font-medium">Class name</label><Input id="class-title" name="title" placeholder="e.g. Introduction to Biology" required maxLength={120} /></div>
    <div className="space-y-2"><label htmlFor="class-description" className="text-sm font-medium">Description <span className="font-normal text-muted-foreground">(optional)</span></label><Textarea id="class-description" name="description" placeholder="What will students learn?" maxLength={2000} className="min-h-20 resize-y" /></div>
    {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    <Button type="submit" disabled={pending} className="w-full"><Plus />{pending ? "Creating class…" : "Create class"}</Button>
  </form>;
}

export function JoinClassForm() {
  const [state, action, pending] = useActionState(joinClass, {});
  return <form action={action} className="space-y-3">
    <div className="flex gap-2"><label className="sr-only" htmlFor="join-code">Class join code</label><Input id="join-code" name="code" placeholder="Enter 10-character code" autoComplete="off" maxLength={10} minLength={10} required className="uppercase tracking-[0.16em]" /><Button type="submit" aria-label="Join class" disabled={pending} size="icon"><ArrowRight /></Button></div>
    {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    {!state.error && <p className="flex items-center gap-2 text-xs text-muted-foreground"><UsersRound className="size-3.5" />Ask your lecturer for the class code.</p>}
  </form>;
}
