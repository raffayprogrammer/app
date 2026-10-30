// Gmail over OAuth: connect a workshop's Gmail once, then send email as that account.
// Server-only. Scope is limited to sending mail; the app can't read the inbox.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

/** Short-lived cookie that ties Google's redirect back to the request that started it. */
export const GOOGLE_STATE_COOKIE = "wpos_google_state";

export const GMAIL_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.send"];

/** Thrown when Google no longer accepts the saved connection (revoked, or expired in testing mode). */
export class GmailDisconnectedError extends Error {}

function config() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.APP_URL;
  if (!clientId || !clientSecret || !appUrl) throw new Error("Gmail is not configured on the server.");
  // Must match an "Authorized redirect URI" in Google Cloud Console exactly.
  return { clientId, clientSecret, redirectUri: `${appUrl.replace(/\/$/, "")}/api/google/callback` };
}

export function googleAuthUrl(state: string): string {
  const { clientId, redirectUri } = config();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline", // get a refresh token so we can send later without the user present
    prompt: "consent", // always return a refresh token, even on reconnect
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

/** Exchange the code from Google's redirect for a refresh token and the account's email address. */
export async function exchangeCode(code: string): Promise<{ refreshToken: string; email: string; scopes: string[] }> {
  const { clientId, clientSecret, redirectUri } = config();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const tok = await res.json();
  if (!res.ok) throw new Error(tok.error_description ?? tok.error ?? "Google sign-in failed");
  if (!tok.refresh_token) throw new Error("Google did not return a refresh token. Remove the app's access in your Google account and connect again.");
  const info = await (await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${tok.access_token}` } })).json();
  if (!info.email) throw new Error("Could not read the Gmail address.");
  return { refreshToken: tok.refresh_token, email: info.email, scopes: String(tok.scope ?? "").split(" ") };
}

async function accessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = config();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" }),
  });
  const tok = await res.json();
  if (!res.ok) {
    if (tok.error === "invalid_grant") throw new GmailDisconnectedError("The Gmail connection has expired.");
    throw new Error(tok.error_description ?? tok.error ?? "Google token refresh failed");
  }
  return tok.access_token;
}

export async function revokeToken(refreshToken: string) {
  await fetch(`${REVOKE_URL}?token=${encodeURIComponent(refreshToken)}`, { method: "POST" }).catch(() => {});
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const b64url = (s: string) => b64(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
/** RFC 2047 encoding so names and subjects with non-ASCII characters survive. */
const header = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const wrap76 = (s: string) => s.replace(/.{1,76}/g, "$&\r\n");

export async function sendGmail(args: {
  refreshToken: string;
  fromName: string;
  fromEmail: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
}) {
  const token = await accessToken(args.refreshToken);
  const boundary = `wpos_${crypto.randomUUID()}`;
  const mime = [
    `From: ${header(args.fromName)} <${args.fromEmail}>`,
    `To: ${args.to}`,
    ...(args.replyTo ? [`Reply-To: ${args.replyTo}`] : []),
    `Subject: ${header(args.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(b64(args.text)),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(b64(args.html)),
    `--${boundary}--`,
  ].join("\r\n");

  const res = await fetch(SEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: b64url(mime) }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) throw new GmailDisconnectedError("The Gmail connection has expired.");
    throw new Error(body?.error?.message ?? `Gmail refused the email (${res.status})`);
  }
}
