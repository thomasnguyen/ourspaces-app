// The sign-in code. "Join" is an emailed six-digit number, never a password
// (§1 hard rule: no email+password, ever). Spec: docs/data-model-plan.md §1.
//
// It rides the AgentMail integration the spaces already use, which means no
// new credential to set up and one more real job for a sponsor. It sends from
// `ourspaces@agentmail.to` deliberately: AgentMail's free tier caps at three
// inboxes PER ORG and all three are already spoken for, so this must not
// create one (docs/firecrawl-agentmail-setup.md § Gotchas).
import { Email } from "@convex-dev/auth/providers/Email";
import type { EmailConfig } from "@convex-dev/auth/server";
import { components } from "./_generated/api";
import { env, type ActionCtx } from "./_generated/server";
import type { DataModel } from "./_generated/dataModel";
import { rateLimiter } from "./rateLimits";

const API = "https://api.agentmail.to/v0";

/** The account-level inbox, not a space's. Never create a fourth. */
const OTP_INBOX_ID = "ourspaces@agentmail.to";

export const OTP_PROVIDER_ID = "email-otp";

/** Six digits from the CSPRNG — this code is the whole credential. */
async function sixDigits() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

// Convex Auth passes `ctx` as a second argument, but Auth.js's type declares
// exactly one parameter (@auth/core/providers/email.d.ts) and convex-auth
// suppresses the mismatch on its own call site. A two-param arrow isn't
// assignable to a one-param type, so the seam gets cast here too.
const sendCode = (async (
  { identifier: email, token }: { identifier: string; token: string },
  ctx: ActionCtx,
) => {
  await rateLimiter.limit(ctx, "otpSend", {
    key: email.toLowerCase(),
    throws: true,
  });
  await ctx.runAction(components.agentMail.lib.sendMessage, {
    apiKey: env.AGENTMAIL_API_KEY,
    baseUrl: API,
    inboxId: OTP_INBOX_ID,
    to: [email],
    subject: `${token} — your code for OurSpaces`,
    text: [
      token,
      "",
      "Punch this back into OurSpaces and you're in. Good for 10 minutes.",
      "",
      "Didn't ask for it? Ignore this — nothing happened to your stuff.",
    ].join("\n"),
    html: codeEmail(token),
    labels: ["otp"],
  });
}) as unknown as EmailConfig["sendVerificationRequest"];

/**
 * The mail is a surface too — a plain-text code from a product about making
 * dull things feel owned is a missed beat. Tokens are inlined as literals
 * because mail clients have no @theme and strip <style>; every colour here
 * matches src/index.css.
 */
function codeEmail(token: string) {
  const digits = token
    .split("")
    .map(
      (d) =>
        `<td style="padding:0 3px;"><div style="width:42px;height:56px;background:#211922;border-radius:10px;color:#c9ff3d;font-family:'Bricolage Grotesque',Georgia,serif;font-size:30px;font-weight:800;line-height:56px;text-align:center;">${d}</div></td>`,
    )
    .join("");

  return `<!doctype html><html><body style="margin:0;padding:0;background:#0b0b0e;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0e;padding:36px 16px;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" width="420" style="width:420px;max-width:100%;background:#fffaf7;border-radius:22px;overflow:hidden;">
      <tr><td style="background:#7853ff;padding:18px 26px;">
        <span style="color:#fffaf7;font-family:'Bricolage Grotesque',Georgia,serif;font-size:19px;font-weight:800;">OurSpaces</span>
      </td></tr>
      <tr><td style="padding:30px 26px 8px;">
        <p style="margin:0 0 6px;color:#5f5055;font-family:'IBM Plex Sans',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;">your six numbers</p>
        <p style="margin:0 0 20px;color:#111114;font-family:'Bricolage Grotesque',Georgia,serif;font-size:25px;font-weight:800;line-height:1.2;">punch these back in and you're in.</p>
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>${digits}</tr></table>
        <p style="margin:20px 0 0;color:#5f5055;font-family:'IBM Plex Sans',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;">Good for 10 minutes. Your name, your colour and the spaces you're in all come with you.</p>
      </td></tr>
      <tr><td style="padding:18px 26px 26px;">
        <p style="margin:0;color:#5f5055;font-family:'IBM Plex Sans',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;">Didn't ask for this? Ignore it — nothing happened to your stuff.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export const EmailOtp = Email<DataModel>({
  id: OTP_PROVIDER_ID,
  // Ten minutes. The library default is an hour, which is a long time for a
  // six-digit number to stay live.
  maxAge: 60 * 10,
  generateVerificationToken: sixDigits,
  sendVerificationRequest: sendCode,
  // The default `authorize` requires the same email in step 2, which is
  // exactly what makes six digits safe to use. Do NOT pass
  // `authorize: undefined` — that's the magic-link shape, where the token
  // alone is enough, and six digits is guessable in that world.
});
