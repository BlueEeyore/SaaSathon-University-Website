"use server";

import { rm } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { captionMediaPath, normalizedMediaPath, sourceMediaPath, tempMediaPath } from "@/lib/media";
import { classSchema, idSchema, joinClassSchema, type FormState } from "@/lib/validation";

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

export async function cancelLecture(_: FormState, form: FormData): Promise<FormState> {
  const lectureId = idSchema.safeParse(form.get("lectureId"));
  if (!lectureId.success) return { error: "This lecture could not be found." };

  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("cancel_lecture", {
    target_lecture: lectureId.data,
  });
  if (error) return { error: "We couldn’t cancel this lecture. Please try again." };
  const cancelled = data?.[0];
  if (!cancelled) {
    return { error: "This lecture has finished processing or is no longer available." };
  }

  const mediaPaths = [
    sourceMediaPath(cancelled.lecture_id, cancelled.source_format),
    normalizedMediaPath(cancelled.lecture_id),
    captionMediaPath(cancelled.lecture_id),
    tempMediaPath(`${cancelled.lecture_id}.upload`),
    tempMediaPath(`${cancelled.lecture_id}.processing.mp4`),
    tempMediaPath(`${cancelled.lecture_id}.processing.vtt`),
    tempMediaPath(`${cancelled.lecture_id}.audio.wav`),
  ];
  const cleanup = await Promise.allSettled(mediaPaths.map((filePath) => rm(filePath, { force: true })));
  if (cleanup.some((result) => result.status === "rejected")) {
    console.error("Some media files could not be removed after lecture cancellation.");
  }

  const { error: finalizeError } = await supabase.rpc("finalize_cancelled_lecture", {
    target_lecture: cancelled.lecture_id,
  });
  if (finalizeError) {
    return { error: "The lecture was cancelled, but its queue entry could not be removed. Refresh the page and try again." };
  }

  revalidatePath(`/classes/${cancelled.class_id}`);
  return { success: "Lecture cancelled and removed." };
}
