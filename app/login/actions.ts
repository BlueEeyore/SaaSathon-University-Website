"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error("Could not sign out. Please try again.");
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const headerStore = await headers();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const origin = siteUrl || headerStore.get("origin") || "http://localhost:3000";
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: new URL("/auth/callback", origin).toString() },
  });
  if (error || !data.url) redirect("/login?error=google");
  redirect(data.url);
}
