import nodemailer from "nodemailer";

const DEFAULT_FROM = process.env.EMAIL_FROM || "SimpleBank <no-reply@simplebank.test>";

export async function sendVerificationEmail(to: string, code: string) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  const subject = "Your SimpleBank verification code";
  const text = `Use this code to verify your account: ${code}\nThis code expires in 10 minutes.`;
  const html = `
    <div style="font-family:Inter,system-ui,sans-serif;line-height:1.6;color:#0f172a">
      <h2 style="margin:0 0 12px;font-size:20px;color:#0f172a">Verify your SimpleBank account</h2>
      <p style="margin:0 0 12px">Use the code below to finish signing up. It expires in 10 minutes.</p>
      <div style="display:inline-block;padding:12px 18px;border-radius:10px;background:#0ea5e9;color:#0b1220;font-size:20px;font-weight:700;letter-spacing:2px;">${code}</div>
      <p style="margin:16px 0 0;font-size:12px;color:#475569">If you didn’t request this, you can ignore the email.</p>
    </div>
  `;

  if (!host || !user || !pass) {
    console.log(`[email] SMTP not configured; would send to ${to}: code ${code}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({ from: DEFAULT_FROM, to, subject, text, html });
  } catch (err) {
    console.warn(`[email] Failed to send verification email to ${to}:`, err);
  }
}
