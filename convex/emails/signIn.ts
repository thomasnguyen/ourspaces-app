// Email clients need inline values. These match src/index.css @theme; keep
// the display/body fallbacks sans-serif when a client can't load web fonts.
const colors = {
  sticker: "#0b0b0e",
  crew: "#7853ff",
  card: "#fffaf7",
  ink: "#111114",
  muted: "#5f5055",
};
const display = "'Bricolage Grotesque',Arial,Helvetica,sans-serif";
const body = "'IBM Plex Sans',Arial,Helvetica,sans-serif";

export const signInHeaderPath = "/assets/email/signin-header.png";
export const signInCodeLifetimeMinutes = 20;

/** token is the server-generated six-digit credential, never user input. */
export function signInEmail(token: string, siteUrl: string) {
  const imageUrl = `${siteUrl.replace(/\/$/, "")}${signInHeaderPath}`;

  return {
    subject: `${token} — your code for OurSpaces`,
    text: [
      "Your sign-in code",
      "",
      token,
      "",
      "Enter this code in OurSpaces.",
      `Expires in ${signInCodeLifetimeMinutes} minutes.`,
      "",
      "Didn't request this? You can ignore this email.",
    ].join("\n"),
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Your sign-in code for OurSpaces</title>
  <style>
    @media screen and (max-width: 480px) {
      .email-outer { padding: 20px 12px !important; }
      .email-content { padding: 28px 24px 30px !important; }
      .email-heading { font-size: 26px !important; line-height: 32px !important; }
      .email-code { font-size: 48px !important; line-height: 64px !important; letter-spacing: 2px !important; padding: 12px 8px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${colors.sticker};-webkit-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">Enter your code in OurSpaces. Expires in ${signInCodeLifetimeMinutes} minutes.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${colors.sticker}" style="width:100%;background:${colors.sticker};">
    <tr><td class="email-outer" align="center" style="padding:40px 20px;">
      <!--[if mso]><table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${colors.card}" style="width:100%;max-width:520px;background:${colors.card};border-radius:16px;">
        <tr><td bgcolor="${colors.crew}" style="background:${colors.crew};border-radius:16px 16px 0 0;">
          <img src="${imageUrl}" width="520" alt="OurSpaces" style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:16px 16px 0 0;color:${colors.card};font-family:${display};font-size:32px;font-weight:800;">
        </td></tr>
        <tr><td class="email-content" style="padding:32px 32px 34px;">
          <h1 class="email-heading" style="margin:0 0 22px;color:${colors.ink};font-family:${display};font-size:32px;line-height:38px;font-weight:800;letter-spacing:-.8px;">Your sign-in code</h1>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td class="email-code" align="center" bgcolor="${colors.sticker}" style="padding:14px 12px;background:${colors.sticker};border-radius:12px;color:${colors.card};font-family:${display};font-size:64px;line-height:80px;font-weight:800;letter-spacing:4px;white-space:nowrap;">${token}</td></tr>
          </table>
          <p style="margin:24px 0 0;color:${colors.muted};font-family:${body};font-size:17px;font-weight:400;line-height:26px;">Enter this code in OurSpaces.<br>Expires in ${signInCodeLifetimeMinutes} minutes.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:30px;">
            <tr><td style="padding-top:20px;border-top:1px solid ${colors.muted};">
              <p style="margin:0;color:${colors.muted};font-family:${body};font-size:13px;font-weight:400;line-height:20px;">Didn't request this? You can ignore this email.</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`,
  };
}
