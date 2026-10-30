// Feature switches, set with environment variables.

/**
 * Real invoice emails through the workshop's Gmail. Off for now: the Email button only
 * confirms "Email has been sent". Set NEXT_PUBLIC_EMAIL_SENDING=live to turn sending on
 * (and show Settings → Email to connect Gmail).
 */
export const EMAIL_SENDING_LIVE = process.env.NEXT_PUBLIC_EMAIL_SENDING === "live";
