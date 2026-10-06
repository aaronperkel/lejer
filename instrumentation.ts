// Runs once per server instance before it serves anything. Production must be able to send
// mail: without a Resend key the login flow would have nowhere to put codes, and lib/mail.ts
// only falls back to printing them outside production. Fail the boot instead of degrading.
export function register() {
  if (process.env.VERCEL_ENV === "production" && !process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set in production; refusing to start");
  }
}
