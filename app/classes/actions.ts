"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { classSchema, joinClassSchema, type FormState } from "@/lib/validation";

export async function createClass(_: FormState, form: FormData): Promise<FormState> {
  const input = classSchema.safeParse({
    title: form.get("title"),
    description: form.get("description") ?? "",
  });
  if (!input.success) return { error: input.error.issues[0]?.message ?? "Check the class details." };

  const { supabase } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("role").single();
  if (profile?.role !== "lecturer") return { error: "Lecturer access is required to create a class." };

  const { data: id, error } = await supabase.rpc("create_class", {
    class_title: input.data.title,
    class_description: input.data.description,
  });
  if (error || !id) return { error: "We couldn’t create the class. Please try again." };

  revalidatePath("/classes");
  redirect(`/classes/${id}`);
}

export async function joinClass(_: FormState, form: FormData): Promise<FormState> {
  const input = joinClassSchema.safeParse({ code: form.get("code") });
  if (!input.success) return { error: input.error.issues[0]?.message ?? "Enter a valid class code." };

  const { supabase } = await requireUser();
  const { data: classId, error } = await supabase.rpc("redeem_join_code", { code: input.data.code });
  if (error) return { error: "We couldn’t join that class. Please try again." };
  if (!classId) return { error: "We couldn’t find a class with that code. Check it and try again." };
  revalidatePath("/classes");
  redirect(`/classes/${classId}`);
}
