import "server-only";
import { createClient } from "@/lib/supabase/server";
import { idSchema } from "@/lib/validation";

export async function getReadableLecture(lectureId: string) {
  if (!idSchema.safeParse(lectureId).success) return null;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims.sub) return null;
  const { data: lecture } = await supabase
    .from("lectures")
    .select("id, class_id, status")
    .eq("id", lectureId)
    .maybeSingle();
  if (!lecture) return null;
  return { lecture };
}
