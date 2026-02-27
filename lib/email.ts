import nodemailer from "nodemailer";

const DEFAULT_FROM = process.env.EMAIL_FROM || "SimpleBank <no-reply@simplebank.test>";

function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendVerificationEmail(to: string, code: string) {
  const transporter = getTransport();

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

  if (!transporter) {
    console.log(`[email] SMTP not configured; would send verification to ${to}: code ${code}`);
    return;
  }

  try {
    await transporter.sendMail({ from: DEFAULT_FROM, to, subject, text, html });
  } catch (err) {
    console.warn(`[email] Failed to send verification email to ${to}:`, err);
  }
}

type TransactionEmailInput = {
  to: string;
  userName: string;
  accountName: string;
  type: "DEPOSIT" | "WITHDRAW" | "TRANSFER_OUT" | "TRANSFER_IN";
  amountCents: number;
  balanceAfterCents: number;
  description?: string | null;
  source?: string | null;
  timestamp: Date;
  counterparty?: string;
};

export async function sendTransactionEmail(input: TransactionEmailInput) {
  const transporter = getTransport();
  if (!transporter) {
    console.log(`[email] SMTP not configured; would send txn mail to ${input.to} for ${input.type} ${input.amountCents}`);
    return;
  }

  const amount = (input.amountCents / 100).toLocaleString("en-EG", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 2,
  });
  const balance = (input.balanceAfterCents / 100).toLocaleString("en-EG", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 2,
  });

  const titleMap: Record<TransactionEmailInput["type"], string> = {
    DEPOSIT: "Deposit posted",
    WITHDRAW: "Withdrawal posted",
    TRANSFER_OUT: "Transfer sent",
    TRANSFER_IN: "Transfer received",
  };

  const subject = `SimpleBank: ${titleMap[input.type]} (${amount})`;
  const descriptionLine = input.description ? `<p style="margin:6px 0;color:#475569;">Note: ${input.description}</p>` : "";
  const sourceLine = input.source ? `<p style="margin:6px 0;color:#475569;">Source: ${input.source}</p>` : "";
  const counterpartyLine = input.counterparty ? `<p style="margin:6px 0;color:#475569;">Counterparty: ${input.counterparty}</p>` : "";
  const html = `
    <div style="font-family:Inter,system-ui,sans-serif;line-height:1.6;color:#0f172a;padding:12px 0;">
      <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">${titleMap[input.type]}</h2>
      <p style="margin:0 0 8px;">Hi ${input.userName}, a transaction was recorded on <strong>${input.accountName}</strong>.</p>
      <div style="margin:12px 0;padding:12px;border-radius:10px;background:#0ea5e914;border:1px solid #0ea5e94d;">
        <div style="font-weight:700;font-size:18px;color:#0b1220;">${amount}</div>
        <div style="color:#475569;font-size:14px;">Type: ${titleMap[input.type]}</div>
        <div style="color:#475569;font-size:14px;">Account: ${input.accountName}</div>
        ${counterpartyLine}
        ${sourceLine}
        ${descriptionLine}
        <div style="color:#475569;font-size:14px;">When: ${input.timestamp.toISOString()}</div>
        <div style="color:#0f172a;font-size:14px;font-weight:600;margin-top:8px;">Balance after: ${balance}</div>
      </div>
      <p style="margin:12px 0 0;font-size:12px;color:#94a3b8;">If this wasn’t you, please secure your account.</p>
    </div>
  `;

  const text = `Transaction on ${input.accountName}\nType: ${titleMap[input.type]}\nAmount: ${amount}\nBalance after: ${balance}\n${input.description ? "Note: " + input.description + "\n" : ""}${input.source ? "Source: " + input.source + "\n" : ""}${input.counterparty ? "Counterparty: " + input.counterparty + "\n" : ""}When: ${input.timestamp.toISOString()}`;

  try {
    await transporter.sendMail({ from: DEFAULT_FROM, to: input.to, subject, text, html });
  } catch (err) {
    console.warn(`[email] Failed to send transaction email to ${input.to}:`, err);
  }
}
