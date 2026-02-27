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

type OverdraftEmailInput = {
  to: string;
  userName: string;
  accountName: string;
  balanceCents: number;
  anchorDate: Date;
  dueAt: Date;
  penaltyCents?: number;
};

export async function sendOverdraftWarningEmail(input: OverdraftEmailInput) {
  const transporter = getTransport();
  if (!transporter) {
    console.log(`[email] SMTP not configured; would send overdraft warning to ${input.to} at balance ${input.balanceCents}`);
    return;
  }

  const balance = (input.balanceCents / 100).toLocaleString("en-EG", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 2,
  });

  const penaltyLine =
    input.penaltyCents && input.penaltyCents > 0
      ? `Current accrued penalty: ${(Math.abs(input.penaltyCents) / 100).toLocaleString("en-EG", {
          style: "currency",
          currency: "EGP",
          minimumFractionDigits: 2,
        })}`
      : null;

  const subject = `Overdraft warning: pay within 30 days`;
  const text = `Your account ${input.accountName} is negative (${balance}). Pay within 30 days (by ${input.dueAt.toDateString()}) to avoid deletion. Overdraft began on ${input.anchorDate.toDateString()}. A 5% daily penalty is applied until you repay.${penaltyLine ? " " + penaltyLine : ""}`;
  const html = `
    <div style="font-family:Inter,system-ui,sans-serif;line-height:1.6;color:#0f172a;padding:12px 0;">
      <h2 style="margin:0 0 8px;font-size:20px;color:#b91c1c;">Overdraft warning</h2>
      <p style="margin:0 0 8px;">Hi ${input.userName}, your account <strong>${input.accountName}</strong> is negative.</p>
      <div style="margin:12px 0;padding:12px;border-radius:12px;background:#fef2f2;border:1px solid #fca5a5;">
        <div style="font-weight:700;font-size:18px;color:#b91c1c;">Balance: ${balance}</div>
        <div style="color:#7f1d1d;font-size:14px;">Overdraft since: ${input.anchorDate.toDateString()}</div>
        <div style="color:#7f1d1d;font-size:14px;">Due date: ${input.dueAt.toDateString()}</div>
        ${penaltyLine ? `<div style="color:#7f1d1d;font-size:14px;">${penaltyLine}</div>` : ""}
        <div style="color:#7f1d1d;font-size:14px;margin-top:6px;">A 5% daily penalty applies until you repay.</div>
        <div style="color:#7f1d1d;font-size:14px;margin-top:6px;">If unpaid by the due date, the account will be deleted.</div>
      </div>
      <p style="margin:12px 0 0;font-size:13px;color:#334155;">Please add funds or transfer money to bring the balance to zero or above within 30 days.</p>
    </div>
  `;

  try {
    await transporter.sendMail({ from: DEFAULT_FROM, to: input.to, subject, text, html });
  } catch (err) {
    console.warn(`[email] Failed to send overdraft email to ${input.to}:`, err);
  }
}

type RequestEmailInput = {
  to: string;
  targetName: string;
  requesterName: string;
  amountCents: number;
  dueAt: Date;
  type: "DEMAND" | "LOAN";
  description?: string | null;
};

export async function sendMoneyRequestEmail(input: RequestEmailInput) {
  const transporter = getTransport();
  if (!transporter) {
    console.log(`[email] SMTP not configured; would send request email to ${input.to} for ${input.amountCents}`);
    return;
  }

  const amount = (input.amountCents / 100).toLocaleString("en-EG", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 2,
  });

  const title = input.type === "LOAN" ? "Loan request" : "Payment request";
  const descLine = input.description ? `<p style="margin:8px 0 0;color:#475569;">Note: ${input.description}</p>` : "";
  const tone = input.type === "LOAN" ? "#b91c1c" : "#0f172a";
  const subject = `SimpleBank: ${title} for ${amount}`;
  const text = `${input.requesterName} requested ${amount} (${input.type === "LOAN" ? "loan" : "payment"}). Please respond by ${input.dueAt.toDateString()}. ${input.description || ""}`.trim();
  const html = `
    <div style="font-family:Inter,system-ui,sans-serif;line-height:1.6;color:#0f172a;padding:12px 0;">
      <h2 style="margin:0 0 8px;font-size:20px;color:${tone};">${title}</h2>
      <p style="margin:0 0 8px;">Hi ${input.targetName}, ${input.requesterName} requested <strong>${amount}</strong> (${input.type === "LOAN" ? "loan" : "payment"}).</p>
      <p style="margin:0 0 8px;">Please accept or reject by <strong>${input.dueAt.toDateString()}</strong>.</p>
      ${descLine}
      ${input.type === "LOAN" ? '<p style="margin:8px 0 0;color:#b91c1c;font-weight:600;">If unpaid after the due date, a 5% daily penalty will be charged by Admin Account.</p>' : ""}
    </div>
  `;

  try {
    await transporter.sendMail({ from: DEFAULT_FROM, to: input.to, subject, text, html });
  } catch (err) {
    console.warn(`[email] Failed to send request email to ${input.to}:`, err);
  }
}

type RequestStatusEmailInput = {
  to: string;
  requesterName: string;
  responderName: string;
  amountCents: number;
  type: "DEMAND" | "LOAN";
  status: "ACCEPTED" | "REJECTED";
};

export async function sendRequestStatusEmail(input: RequestStatusEmailInput) {
  const transporter = getTransport();
  if (!transporter) {
    console.log(`[email] SMTP not configured; would send request status ${input.status} to ${input.to}`);
    return;
  }

  const amount = (input.amountCents / 100).toLocaleString("en-EG", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 2,
  });

  const title = `${input.type === "LOAN" ? "Loan" : "Payment"} request ${input.status.toLowerCase()}`;
  const subject = `SimpleBank: ${title} (${amount})`;
  const text = `${input.responderName} ${input.status.toLowerCase()} your ${input.type === "LOAN" ? "loan" : "payment"} request for ${amount}.`;
  const html = `
    <div style="font-family:Inter,system-ui,sans-serif;line-height:1.6;color:#0f172a;padding:12px 0;">
      <h2 style="margin:0 0 8px;font-size:20px;">${title}</h2>
      <p style="margin:0 0 8px;">${input.responderName} ${input.status.toLowerCase()} your ${input.type === "LOAN" ? "loan" : "payment"} request for <strong>${amount}</strong>.</p>
    </div>
  `;

  try {
    await transporter.sendMail({ from: DEFAULT_FROM, to: input.to, subject, text, html });
  } catch (err) {
    console.warn(`[email] Failed to send request status email to ${input.to}:`, err);
  }
}
