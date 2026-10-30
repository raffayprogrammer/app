import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { GOOGLE_STATE_COOKIE, googleAuthUrl } from "@/lib/google";
import { currentMember } from "@/lib/supabase/server";

/** Starts "Connect Gmail": only the workshop owner may connect the account invoices are sent from. */
export async function GET(request: NextRequest) {
  const member = await currentMember(["owner"]);
  if (!member) return NextResponse.redirect(new URL("/settings?gmail=forbidden", request.url));

  const state = crypto.randomUUID();
  (await cookies()).set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/google",
  });
  return NextResponse.redirect(googleAuthUrl(state));
}
