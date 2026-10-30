import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, GOOGLE_STATE_COOKIE, revokeToken } from "@/lib/google";
import { adminClient, currentMember } from "@/lib/supabase/server";

/** Google sends the owner back here after they allow access. Saves the Gmail connection for their workshop. */
export async function GET(request: NextRequest) {
  const back = (result: string) => NextResponse.redirect(new URL(`/settings?gmail=${result}`, request.url));
  const params = request.nextUrl.searchParams;
  const jar = await cookies();
  const expected = jar.get(GOOGLE_STATE_COOKIE)?.value;
  jar.delete({ name: GOOGLE_STATE_COOKIE, path: "/api/google" });

  if (params.get("error")) return back("cancelled");
  if (!expected || params.get("state") !== expected) return back("expired");

  const member = await currentMember(["owner"]);
  if (!member) return back("forbidden");

  const code = params.get("code");
  if (!code) return back("error");
  try {
    const { refreshToken, email, scopes } = await exchangeCode(code);
    if (!scopes.includes("https://www.googleapis.com/auth/gmail.send")) {
      await revokeToken(refreshToken);
      return back("noscope");
    }
    const admin = adminClient();
    const previous = (await admin.from("workshop_email_accounts").select("refresh_token").eq("workshop_id", member.workshopId).maybeSingle()).data;
    const { error } = await admin.from("workshop_email_accounts").upsert({
      workshop_id: member.workshopId, email, refresh_token: refreshToken, connected_by: member.userId, connected_at: new Date().toISOString(),
    });
    if (error) return back("error");
    if (previous && previous.refresh_token !== refreshToken) await revokeToken(previous.refresh_token);
    await admin.from("audit_log").insert({
      workshop_id: member.workshopId, user_id: member.userId, action: "gmail.connected", entity: "workshop", entity_id: member.workshopId,
      summary: `Gmail connected: ${email}`,
    });
    return back("connected");
  } catch (e) {
    console.error("Gmail connect failed:", e);
    return back("error");
  }
}
