import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=callback", request.url));

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=callback", request.url));

  // These functions use the verified Supabase identity. Lecturer access is
  // granted only when the account email is in the database allowlist.
  await Promise.all([
    supabase.rpc("claim_roster_memberships"),
    supabase.rpc("claim_lecturer_role"),
  ]);
  return NextResponse.redirect(new URL("/classes", request.url));
}
