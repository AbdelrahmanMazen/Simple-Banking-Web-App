"use server";

import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sendMoneyRequestEmail, sendOverdraftWarningEmail, sendRequestStatusEmail, sendTransactionEmail } from "@/lib/email";
import prisma from "@/lib/prisma";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const arabicDigitMap: Record<string, string> = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
};

function normalizeNumericInput(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return Number.NaN;
  let normalized = value.trim().replace(/[٠-٩]/g, (d) => arabicDigitMap[d] || d);

  const hasDotDecimal = normalized.includes(".") || normalized.includes("٫");
  if (hasDotDecimal) {
    // Keep dot as decimal; strip thousands separators; map Arabic decimal to dot.
    normalized = normalized.replace(/[,٬،]/g, "").replace(/٫/g, ".");
  } else if (normalized.includes(",")) {
    // If no dot but comma exists, treat comma as decimal (e.g., 123,45).
    normalized = normalized.replace(/[,٬،]/g, ".");
  } else {
    // No decimal separators; just strip thousands commas if any.
    normalized = normalized.replace(/[,٬،]/g, "");
  }

  normalized = normalized.replace(/\s+/g, "");
  return Number(normalized);
}

const moneySchema = z.preprocess(normalizeNumericInput, z.number().positive());
const adminMoneySchema = z.preprocess(normalizeNumericInput, z.number().nonnegative());
const idSchema = z.preprocess(normalizeNumericInput, z.number().int().positive());

const optionalTrimmedString = z.preprocess(
  (val) => {
    if (val === undefined || val === null) return undefined;
    if (typeof val === "string") return val.trim();
    if (Array.isArray(val)) return String(val[0]).trim();
    return String(val).trim();
  },
  z.string().optional()
);

const deleteTxnSchema = z.object({
  transactionId: idSchema,
  reason: z.string().trim().max(200).optional(),
});

const deleteTxnBulkSchema = z.object({
  transactionIds: z.array(idSchema).min(1),
  reason: z.string().trim().max(200).optional(),
});

const deleteUserSchema = z.object({
  userId: idSchema,
  reason: z.string().trim().max(200).optional(),
});

const clearAuditSchema = z.object({
  confirm: z.string().trim().toLowerCase(),
});

const adjustMostafaDebtSchema = z.object({
  amount: adminMoneySchema,
  direction: z.enum(["add", "pay"]),
});

const renumberAccountSchema = z.object({
  accountId: idSchema,
  newAccountId: idSchema,
});

const targetAccountNameSchema = z.string().trim().min(1).max(120);
const requestSchema = z.object({
  targetName: z.string().trim().min(1).max(80),
  amount: moneySchema,
  description: z.string().optional(),
  type: z.enum(["DEMAND", "LOAN"]),
});

const requestIdSchema = z
  .string()
  .transform((val) => Number(val))
  .pipe(z.number().int().positive());

const emptyToUndefined = (val: unknown) => (typeof val === "string" && val.trim() === "" ? undefined : val);

const announcementSchema = z.object({
  title: z.string().trim().min(3).max(120),
  titleAr: z.string().trim().max(120).optional(),
  body: z.string().trim().max(600).optional(),
  bodyAr: z.string().trim().max(600).optional(),
  mediaUrl: z.preprocess(emptyToUndefined, z.string().trim().url().max(500).optional()),
  youtubeUrl: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
});

const announcementScheduleSchema = announcementSchema.extend({
  startsAt: z.string().trim().optional(),
  endsAt: z.string().trim().optional(),
  status: z.enum(["DRAFT", "SCHEDULED", "ACTIVE"]).optional(),
  publishNow: z.preprocess((val) => (val === null ? undefined : val), z.string().optional()),
});

const announcementScheduleUpdateSchema = announcementScheduleSchema.extend({
  id: idSchema,
});

const announcementScheduleIdSchema = z.object({
  id: idSchema,
});

const domainAdminEmail = process.env.DOMAIN_ADMIN_EMAIL?.toLowerCase();

function extractYoutubeId(input?: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const directId = /^[A-Za-z0-9_-]{11}$/;
  if (directId.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (url.hostname.includes("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v && directId.test(v)) return v;
      const pathId = url.pathname.split("/").filter(Boolean).pop();
      if (pathId && directId.test(pathId)) return pathId;
    }
    if (url.hostname === "youtu.be") {
      const id = url.pathname.replace("/", "");
      if (id && directId.test(id)) return id;
    }
  } catch {
    // ignore parsing errors
  }

  return null;
}

async function isAnnouncementModelAvailable() {
  try {
    await prisma.announcement.count();
    return true;
  } catch {
    return false;
  }
}

async function isAnnouncementScheduleAvailable() {
  try {
    await prisma.announcementSchedule.count();
    return true;
  } catch {
    console.log("isAnnouncementScheduleAvailable:countFailed");
    return false;
  }
}

function parseDateInput(raw?: string | null): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function resolveScheduleStatus(input?: string | null, publishNow?: boolean): "DRAFT" | "SCHEDULED" | "ACTIVE" | "CANCELLED" | "EXPIRED" {
  if (publishNow) return "ACTIVE";
  const normalized = input?.toUpperCase();
  if (normalized === "DRAFT" || normalized === "ACTIVE") return normalized;
  if (normalized === "CANCELLED" || normalized === "EXPIRED") return normalized;
  return "SCHEDULED";
}

async function requireDomainAdmin() {
  const user = await getCurrentUser();
  if (!user || !user.isAdmin) return null;
  if (domainAdminEmail && user.email.toLowerCase() !== domainAdminEmail) return null;
  return user;
}

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !user.isAdmin || !user.isVerified) return null;
  return user;
}

function revalidateBankViews() {
  revalidatePath("/dashboard");
  revalidatePath("/admin");
}

function dashRedirect(params: Record<string, string | undefined>): never {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) usp.set(key, value);
  }
  const query = usp.toString();
  redirect(query ? `/dashboard?${query}` : "/dashboard");
}

async function ensureOverdraftProgress(
  tx: Prisma.TransactionClient,
  account: { id: number; balanceCents: number; createdAt: Date; name?: string | null; user?: { name: string; email: string } | null }
): Promise<{ balanceCents: number; anchorDate: Date }> {
  if (account.balanceCents >= 0) {
    return { balanceCents: account.balanceCents, anchorDate: account.createdAt };
  }

  const existingAlert = await tx.transaction.findFirst({
    where: { accountId: account.id, type: "OVERDRAFT_ALERT", deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const anchorDate =
    existingAlert?.createdAt ||
    (
      await tx.transaction.create({
        data: {
          accountId: account.id,
          type: "OVERDRAFT_ALERT",
          amountCents: 0,
          description: "Balance went negative. Pay within 30 days to avoid deletion.",
          balanceAfterCents: account.balanceCents,
          source: account.name ? `Account: ${account.name}` : undefined,
        },
        select: { createdAt: true },
      })
    ).createdAt;

  if (!existingAlert) {
    const owner =
      account.user ||
      (await tx.account.findUnique({
        where: { id: account.id },
        select: { user: { select: { name: true, email: true } } },
      }))?.user;

    if (owner?.email) {
      const dueAt = new Date(anchorDate.getTime() + 30 * MS_PER_DAY);
      await sendOverdraftWarningEmail({
        to: owner.email,
        userName: owner.name,
        accountName: account.name || "Account",
        balanceCents: account.balanceCents,
        anchorDate,
        dueAt,
        penaltyCents: 0,
      });
    }
  }

  const lastFee = await tx.transaction.findFirst({
    where: { accountId: account.id, type: "OVERDRAFT_FEE", deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const baseDate = lastFee?.createdAt || anchorDate;
  const daysElapsed = Math.floor((Date.now() - baseDate.getTime()) / MS_PER_DAY);
  if (daysElapsed <= 0) {
    return { balanceCents: account.balanceCents, anchorDate };
  }

  const growth = Math.pow(1.05, daysElapsed);
  const newBalance = Math.round(account.balanceCents * growth);

  if (newBalance !== account.balanceCents) {
    const feeDelta = newBalance - account.balanceCents;
    await tx.account.update({ where: { id: account.id }, data: { balanceCents: newBalance } });
    await tx.transaction.create({
      data: {
        accountId: account.id,
        type: "OVERDRAFT_FEE",
        amountCents: Math.abs(feeDelta),
        description: `5% daily overdraft fee x${daysElapsed} day${daysElapsed > 1 ? "s" : ""}`,
        balanceAfterCents: newBalance,
        source: "Overdraft penalty",
      },
    });

    const ownerUser =
      account.user ||
      (await tx.account.findUnique({
        where: { id: account.id },
        select: { user: { select: { name: true, email: true } }, name: true },
      }))?.user;

    if (ownerUser?.email) {
      const dueAt = new Date(anchorDate.getTime() + 30 * MS_PER_DAY);
      await sendOverdraftWarningEmail({
        to: ownerUser.email,
        userName: ownerUser.name,
        accountName: account.name || "Account",
        balanceCents: newBalance,
        anchorDate,
        dueAt,
        penaltyCents: Math.abs(feeDelta),
      });
    }
  }

  return { balanceCents: newBalance, anchorDate };
}

async function recordOverdraftAlert(
  tx: Prisma.TransactionClient,
  accountId: number,
  nextBalanceCents: number,
  label?: string
) {
  const created = await tx.transaction.create({
    data: {
      accountId,
      type: "OVERDRAFT_ALERT",
      amountCents: 0,
      description: "Balance below 0. Repay within 30 days to keep the account.",
      balanceAfterCents: nextBalanceCents,
      source: label?.slice(0, 120),
    },
  });

  const owner = await tx.account.findUnique({
    where: { id: accountId },
    select: { name: true, user: { select: { name: true, email: true } } },
  });

  if (owner?.user?.email) {
    const dueAt = new Date(created.createdAt.getTime() + 30 * MS_PER_DAY);
    await sendOverdraftWarningEmail({
      to: owner.user.email,
      userName: owner.user.name,
      accountName: owner.name || "Account",
      balanceCents: nextBalanceCents,
      anchorDate: created.createdAt,
      dueAt,
      penaltyCents: 0,
    });
  }
}

export async function settleUserOverdrafts(userId: number) {
  const negativeAccounts = await prisma.account.findMany({
    where: { userId, balanceCents: { lt: 0 } },
    select: { id: true },
  });

  for (const acct of negativeAccounts) {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const account = await tx.account.findUnique({
        where: { id: acct.id },
        select: { id: true, balanceCents: true, createdAt: true, name: true, user: { select: { name: true, email: true } } },
      });

      if (!account || account.balanceCents >= 0) return;

      await ensureOverdraftProgress(tx, account);
    });
  }
}

async function getOrCreateUserAccount(userId: number) {
  const existing = await prisma.account.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });
  if (existing) return existing;

  const owner = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  const fallbackName = owner?.name?.trim() || owner?.email || "Account";

  return prisma.account.create({
    data: {
      userId,
      name: fallbackName.slice(0, 60),
    },
  });
}

async function getOrCreateMostafaDebtAccount(tx: Prisma.TransactionClient, mostafaUserId: number) {
  const existing = await tx.account.findFirst({
    where: { userId: mostafaUserId, name: { contains: "debt", mode: "insensitive" } },
    orderBy: { createdAt: "asc" },
  });

  if (existing) return existing;

  return tx.account.create({
    data: {
      userId: mostafaUserId,
      name: "Mostafa Debt",
      balanceCents: 0,
    },
  });
}

async function getAdminAccount() {
  const adminUser = await prisma.user.findFirst({ where: { isAdmin: true }, select: { id: true } });
  if (!adminUser) return null;
  return getOrCreateUserAccount(adminUser.id);
}

export async function settleLoanRequestPenalties(userId: number) {
  const adminAccount = await getAdminAccount();
  if (!adminAccount) return;

  const overdue = await prisma.request.findMany({
    where: {
      targetUserId: userId,
      type: "LOAN",
      status: "PENDING",
      dueAt: { lt: new Date() },
    },
  });

  if (!overdue.length) return;

  const payerAccount = await getOrCreateUserAccount(userId);
  if (!payerAccount) return;

  for (const req of overdue) {
    const last = req.lastPenaltyAt ?? req.dueAt;
    const daysElapsed = Math.floor((Date.now() - last.getTime()) / MS_PER_DAY);
    if (daysElapsed <= 0) continue;

    const penaltyDelta = Math.round(req.amountCents * 0.05 * daysElapsed);
    if (penaltyDelta <= 0) continue;

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const payer = await tx.account.findUnique({ where: { id: payerAccount.id }, select: { id: true, balanceCents: true, name: true, createdAt: true, user: { select: { name: true, email: true } } } });
      if (!payer) return;

      const settledPayer = await ensureOverdraftProgress(tx, payer);
      const nextPayerBalance = settledPayer.balanceCents - penaltyDelta;

      await tx.account.update({ where: { id: payer.id }, data: { balanceCents: nextPayerBalance } });
      await tx.transaction.create({
        data: {
          accountId: payer.id,
          type: "REQUEST_PENALTY_OUT",
          amountCents: penaltyDelta,
          description: "Loan request delay penalty (Admin Account)",
          balanceAfterCents: nextPayerBalance,
          source: "Admin Account",
        },
      });

      const adminUpdated = await tx.account.update({
        where: { id: adminAccount.id },
        data: { balanceCents: { increment: penaltyDelta } },
        select: { balanceCents: true },
      });

      await tx.transaction.create({
        data: {
          accountId: adminAccount.id,
          type: "REQUEST_PENALTY_IN",
          amountCents: penaltyDelta,
          description: "Loan delay penalty collected",
          balanceAfterCents: adminUpdated.balanceCents,
          source: "Loan penalty",
        },
      });

      await tx.request.update({
        where: { id: req.id },
        data: {
          penaltyAccruedCents: { increment: penaltyDelta },
          lastPenaltyAt: new Date(),
        },
      });
    });
  }
}

export async function updateProfile(formData: FormData) {
  const nameRaw = (formData.get("name") as string | null)?.trim() || "";
  const passwordRaw = (formData.get("password") as string | null)?.trim() || "";

  const parsed = z
    .object({
      name: z.string().min(2).max(60).optional(),
      password: z.string().min(6).max(80).optional(),
    })
    .safeParse({
      name: nameRaw.length ? nameRaw : undefined,
      password: passwordRaw.length ? passwordRaw : undefined,
    });

  if (!parsed.success) return;

  const user = await getCurrentUser();
  if (!user) return;

  const { name, password } = parsed.data;
  const updates: Record<string, unknown> = {};

  if (name && name !== user.name) {
    updates.name = name;
  }

  if (password) {
    updates.passwordHash = await bcrypt.hash(password, 10);
  }

  if (Object.keys(updates).length === 0) return;

  await prisma.user.update({ where: { id: user.id }, data: updates });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/account");
  redirect("/dashboard/account?saved=1");
}

export async function createMoneyRequest(formData: FormData) {
  const parsed = requestSchema.safeParse({
    targetName: formData.get("targetName"),
    amount: formData.get("amount"),
    description: formData.get("description"),
    type: formData.get("type"),
  });

  if (!parsed.success) {
    dashRedirect({ transferError: "Invalid request" });
  }

  const user = await getCurrentUser();
  if (!user || !user.isVerified) {
    dashRedirect({ transferError: "You must be signed in and verified" });
  }

  const rawTarget = parsed.data.targetName.trim();
  const normalize = (val: string) => val.trim().toLowerCase();
  const splitOnDash = (val: string) => {
    const parts = val.split(/\s*[—-]\s*/).map((p) => p.trim()).filter(Boolean);
    return parts.length === 2 ? { accountPart: parts[0], ownerPart: parts[1] } : null;
  };

  const parsedCombo = splitOnDash(rawTarget);
  const normalizedRaw = normalize(rawTarget);

  const candidates = await prisma.account.findMany({
    where: { userId: { not: user.id } },
    select: { id: true, name: true, user: { select: { id: true, name: true, email: true } } },
  });

  const scored: { acct: typeof candidates[number]; score: number }[] = [];

  for (const acct of candidates) {
    const nAcct = normalize(acct.name);
    const nOwner = normalize(acct.user.name);
    const combined = normalize(`${acct.name} ${acct.user.name}`);
    let score = 0;

    if (parsedCombo) {
      const nPartAcct = normalize(parsedCombo.accountPart);
      const nPartOwner = normalize(parsedCombo.ownerPart);
      if (nAcct === nPartAcct && nOwner === nPartOwner) score = 100;
      else if (nAcct === nPartAcct && combined.includes(nPartOwner)) score = 80;
      else if (nOwner === nPartOwner && combined.includes(nPartAcct)) score = 80;
    }

    if (score === 0) {
      if (nAcct === normalizedRaw) score = 70;
      else if (nOwner === normalizedRaw) score = 60;
      else if (combined === normalizedRaw) score = 55;
      else if (nAcct.includes(normalizedRaw)) score = 30;
      else if (nOwner.includes(normalizedRaw)) score = 25;
      else if (combined.includes(normalizedRaw)) score = 20;
    }

    if (score > 0) scored.push({ acct, score });
  }

  if (!scored.length) {
    dashRedirect({ transferError: "No account or owner with that name" });
  }

  scored.sort((a, b) => b.score - a.score || a.acct.id - b.acct.id);
  const topScore = scored[0].score;
  const top = scored.filter((s) => s.score === topScore);
  if (top.length > 1) {
    dashRedirect({ transferError: "Multiple matches for that name" });
  }

  const targetAcct = top[0].acct;
  const target = targetAcct.user;

  const requesterAccount = await getOrCreateUserAccount(user.id);
  const targetAccount = await getOrCreateUserAccount(target.id);
  if (!requesterAccount || !targetAccount) {
    dashRedirect({ transferError: "Both users need an account" });
  }

  const now = new Date();
  const dueAt = new Date(now.getTime() + 7 * MS_PER_DAY);

  await prisma.request.create({
    data: {
      requesterId: user.id,
      targetUserId: target.id,
      amountCents: Math.round(parsed.data.amount * 100),
      type: parsed.data.type,
      status: "PENDING",
      description: parsed.data.description?.slice(0, 200),
      dueAt,
    },
  });

  await sendMoneyRequestEmail({
    to: target.email,
    targetName: target.name,
    requesterName: user.name,
    amountCents: Math.round(parsed.data.amount * 100),
    dueAt,
    type: parsed.data.type,
    description: parsed.data.description,
  });

  revalidateBankViews();
  dashRedirect({ transferSuccess: "Request sent" });
}

export async function createAccount(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;

  const name = (formData.get("name") as string | null)?.trim() || "New Account";

  await prisma.account.create({
    data: {
      name: name.slice(0, 40),
      userId: user.id,
    },
  });

  revalidateBankViews();
}

export async function deposit(formData: FormData) {
  const parsed = z
    .object({
      accountId: idSchema,
      amount: moneySchema,
      description: optionalTrimmedString,
      source: z.enum(["Mobile Wallet", "Credit/Debit Card"]),
      walletNumber: optionalTrimmedString,
      cardBank: optionalTrimmedString,
    })
    .safeParse({
      accountId: formData.get("accountId"),
      amount: formData.get("amount"),
      description: formData.get("description"),
      source: formData.get("source"),
      walletNumber: formData.get("walletNumber"),
      cardBank: formData.get("cardBank"),
    });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues?.[0];
    const field = firstIssue?.path?.join(".") || "fields";
    const message = firstIssue?.message || "Invalid deposit request";
    console.warn("[deposit] invalid request", { field, message, issues: parsed.error.issues });
    dashRedirect({ depositError: `Invalid deposit: ${field}` });
    return;
  }

  const { accountId, amount, description, source, walletNumber, cardBank } = parsed.data;
  const walletDigits = (walletNumber || "")
    .replace(/[٠-٩]/g, (d) => arabicDigitMap[d] || "")
    .replace(/\D/g, "");
  const needsWallet = source === "Mobile Wallet";
  const needsCardBank = source === "Credit/Debit Card";
  if (needsWallet && walletDigits.length !== 11) {
    dashRedirect({ depositError: "Wallet number must be 11 digits" });
    return;
  }

  const selectedCardBank = (cardBank || "").trim();
  if (needsCardBank && !selectedCardBank) {
    dashRedirect({ depositError: "Select an issuing bank" });
    return;
  }

  const provider = needsWallet
    ? walletDigits.startsWith("010")
      ? "Vodafone Cash"
      : walletDigits.startsWith("015")
        ? "WE Pay"
        : walletDigits.startsWith("012")
          ? "Orange Cash"
          : walletDigits.startsWith("011")
            ? "E& Cash"
            : "Mobile Wallet"
    : source;

  const maskedWallet = needsWallet ? `${walletDigits.slice(0, 3)}****${walletDigits.slice(-3)}` : "";
  const sourceLabel = needsWallet
    ? `${provider} • ${maskedWallet}`
    : needsCardBank && selectedCardBank
      ? `${source} • ${selectedCardBank}`
      : source;
  const txDescription = description?.slice(0, 120) || (needsWallet ? `Deposit from ${provider}` : needsCardBank ? `Deposit via ${selectedCardBank}` : "Deposit");
  const deltaCents = Math.round(amount * 100);
  let accountName = "";
  let balanceAfterCents = 0;
  const user = await getCurrentUser();
  if (!user || !user.isVerified) {
    dashRedirect({ depositError: "You must be signed in and verified" });
    return;
  }

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const account = await tx.account.findFirst({
        where: { id: accountId, userId: user.id },
        select: { id: true, balanceCents: true, name: true, createdAt: true, user: { select: { name: true, email: true } } },
      });

      if (!account) {
        dashRedirect({ depositError: "Account not found" });
      }

      const settled = await ensureOverdraftProgress(tx, account);
      const nextBalance = settled.balanceCents + deltaCents;
      accountName = account.name;
      balanceAfterCents = nextBalance;

      await tx.account.update({
        where: { id: account.id },
        data: { balanceCents: nextBalance },
      });

      await tx.transaction.create({
        data: {
          accountId: account.id,
          type: "DEPOSIT",
          amountCents: deltaCents,
          description: txDescription,
          balanceAfterCents: nextBalance,
          source: sourceLabel,
        },
      });
    });
  } catch (err) {
    const isNextRedirect =
      err && typeof err === "object" && "digest" in err && typeof (err as any).digest === "string" && (err as any).digest.startsWith("NEXT_REDIRECT");
    if (isNextRedirect) throw err;
    dashRedirect({ depositError: "Deposit failed" });
  }

  revalidateBankViews();

  // Send receipt email (best-effort)
  await sendTransactionEmail({
    to: user.email,
    userName: user.name,
    accountName: accountName || "Account",
    type: "DEPOSIT",
    amountCents: deltaCents,
    balanceAfterCents,
    description,
    source: sourceLabel,
    timestamp: new Date(),
  });
}

export async function withdraw(formData: FormData) {
  const parsed = z
    .object({
      accountId: idSchema,
      amount: moneySchema,
      description: z.string().optional(),
    })
    .safeParse({
      accountId: formData.get("accountId"),
      amount: formData.get("amount"),
      description: formData.get("description"),
    });

  if (!parsed.success) {
    dashRedirect({ withdrawError: "Invalid withdrawal request" });
  }

  const { accountId, amount, description } = parsed.data;
  const deltaCents = Math.round(amount * 100);
  let accountName = "";
  let balanceAfterCents = 0;
  const user = await getCurrentUser();
  if (!user || !user.isVerified) {
    dashRedirect({ withdrawError: "You must be signed in and verified" });
  }

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const account = await tx.account.findFirst({
        where: { id: accountId, userId: user.id },
        select: { id: true, balanceCents: true, name: true, createdAt: true, user: { select: { name: true, email: true } } },
      });

      if (!account) {
        dashRedirect({ withdrawError: "Account not found" });
      }

      const settled = await ensureOverdraftProgress(tx, account);
      const currentBalance = settled.balanceCents;
      const nextBalance = currentBalance - deltaCents;
      accountName = account.name;
      balanceAfterCents = nextBalance;

      if (currentBalance >= 0 && nextBalance < 0) {
        await recordOverdraftAlert(tx, account.id, nextBalance, `Withdrawn ${account.name}`);
      }

      await tx.account.update({
        where: { id: account.id },
        data: { balanceCents: nextBalance },
      });

      await tx.transaction.create({
        data: {
          accountId: account.id,
          type: "WITHDRAW",
          amountCents: deltaCents,
          description: description?.slice(0, 120) || "Withdrawal",
          balanceAfterCents: nextBalance,
        },
      });
    });
  } catch (err) {
    const isNextRedirect =
      err && typeof err === "object" && "digest" in err && typeof (err as any).digest === "string" && (err as any).digest.startsWith("NEXT_REDIRECT");
    if (isNextRedirect) throw err;
    dashRedirect({ withdrawError: "Withdrawal failed" });
  }

  revalidateBankViews();

  await sendTransactionEmail({
    to: user.email,
    userName: user.name,
    accountName: accountName || "Account",
    type: "WITHDRAW",
    amountCents: deltaCents,
    balanceAfterCents,
    description,
    timestamp: new Date(),
  });
}

export async function acceptMoneyRequest(formData: FormData) {
  const parsed = requestIdSchema.safeParse(formData.get("requestId"));
  if (!parsed.success) {
    dashRedirect({ transferError: "Invalid request" });
  }

  const user = await getCurrentUser();
  if (!user || !user.isVerified) {
    dashRedirect({ transferError: "You must be signed in and verified" });
  }

  const req = await prisma.request.findUnique({
    where: { id: parsed.data },
    include: { requester: true, targetUser: true },
  });

  if (!req || req.targetUserId !== user.id || req.status !== "PENDING") {
    dashRedirect({ transferError: "Request not available" });
  }

  const payerAccount = await getOrCreateUserAccount(user.id);
  const receiverAccount = await getOrCreateUserAccount(req.requesterId);
  if (!payerAccount || !receiverAccount) {
    dashRedirect({ transferError: "Both users need an account" });
  }

  await settleLoanRequestPenalties(user.id);

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const lockedReq = await tx.request.findUnique({ where: { id: req.id }, select: { id: true, status: true, targetUserId: true, amountCents: true, type: true, description: true } });
    if (!lockedReq || lockedReq.status !== "PENDING" || lockedReq.targetUserId !== user.id) {
      dashRedirect({ transferError: "Request not available" });
    }

    const payer = await tx.account.findUnique({ where: { id: payerAccount.id }, select: { id: true, balanceCents: true, name: true, createdAt: true, user: { select: { name: true, email: true } } } });
    const receiver = await tx.account.findUnique({ where: { id: receiverAccount.id }, select: { id: true, balanceCents: true, name: true, createdAt: true } });

    if (!payer || !receiver) {
      dashRedirect({ transferError: "Accounts unavailable" });
    }

    const settledPayer = await ensureOverdraftProgress(tx, payer);
    const deltaCents = lockedReq.amountCents;
    const payerNext = settledPayer.balanceCents - deltaCents;
    const receiverNext = receiver.balanceCents + deltaCents;

    await tx.account.update({ where: { id: payer.id }, data: { balanceCents: payerNext } });
    await tx.account.update({ where: { id: receiver.id }, data: { balanceCents: receiverNext } });

    await tx.transaction.create({
      data: {
        accountId: payer.id,
        type: lockedReq.type === "LOAN" ? "LOAN_OUT" : "REQUEST_PAYMENT_OUT",
        amountCents: deltaCents,
        description: lockedReq.description?.slice(0, 120) || (lockedReq.type === "LOAN" ? "Loan sent" : "Payment requested"),
        balanceAfterCents: payerNext,
        source: `To ${receiver.name}`,
      },
    });

    await tx.transaction.create({
      data: {
        accountId: receiver.id,
        type: lockedReq.type === "LOAN" ? "LOAN_IN" : "REQUEST_PAYMENT_IN",
        amountCents: deltaCents,
        description: lockedReq.description?.slice(0, 120) || (lockedReq.type === "LOAN" ? "Loan received" : "Payment received"),
        balanceAfterCents: receiverNext,
        source: `From ${payer.name}`,
      },
    });

    await tx.request.update({
      where: { id: lockedReq.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
  });

  await sendRequestStatusEmail({
    to: req.requester.email,
    requesterName: req.requester.name,
    responderName: user.name,
    amountCents: req.amountCents,
    type: req.type as "DEMAND" | "LOAN",
    status: "ACCEPTED",
  });

  revalidateBankViews();
  dashRedirect({ transferSuccess: "Request accepted" });
}

export async function rejectMoneyRequest(formData: FormData) {
  const parsed = requestIdSchema.safeParse(formData.get("requestId"));
  if (!parsed.success) {
    dashRedirect({ transferError: "Invalid request" });
  }

  const user = await getCurrentUser();
  if (!user || !user.isVerified) {
    dashRedirect({ transferError: "You must be signed in and verified" });
  }

  const req = await prisma.request.findUnique({ where: { id: parsed.data }, include: { requester: true } });
  if (!req || req.targetUserId !== user.id || req.status !== "PENDING") {
    dashRedirect({ transferError: "Request not available" });
  }

  await prisma.request.update({ where: { id: req.id }, data: { status: "REJECTED", rejectedAt: new Date() } });

  await sendRequestStatusEmail({
    to: req.requester.email,
    requesterName: req.requester.name,
    responderName: user.name,
    amountCents: req.amountCents,
    type: req.type as "DEMAND" | "LOAN",
    status: "REJECTED",
  });

  revalidateBankViews();
  dashRedirect({ transferSuccess: "Request rejected" });
}

export async function transfer(formData: FormData) {
  const parsed = z
    .object({
      fromAccountId: idSchema,
      toAccountName: targetAccountNameSchema,
      amount: moneySchema,
      description: z.string().optional(),
      skipDebtPaydown: z.union([z.literal("1"), z.literal("true"), z.literal("on")]).optional(),
    })
    .safeParse({
      fromAccountId: formData.get("fromAccountId"),
      toAccountName: formData.get("toAccountName"),
      amount: formData.get("amount"),
      description: formData.get("description"),
      skipDebtPaydown: formData.get("skipDebtPaydown") ?? undefined,
    });

  if (!parsed.success) {
    dashRedirect({ transferError: "Invalid transfer request" });
  }

  const { fromAccountId, toAccountName, amount, description, skipDebtPaydown } = parsed.data;
  const user = await getCurrentUser();
  if (!user || !user.isVerified) return;

  const rawTarget = toAccountName.trim();

  const normalize = (val: string) => val.trim().toLowerCase();
  const splitOnDash = (val: string) => {
    const parts = val.split(/\s*[—-]\s*/).map((p) => p.trim()).filter(Boolean);
    return parts.length === 2 ? { accountPart: parts[0], ownerPart: parts[1] } : null;
  };

  const parsedCombo = splitOnDash(rawTarget);
  const normalizedRaw = normalize(rawTarget);

  const deltaCents = Math.round(amount * 100);
  let sourceAccountName = "";
  let senderBalanceAfter = 0;
  let counterpartyName = "";
  let receiverAccountName = "";
  let receiverEmail = "";
  let receiverBalanceAfter = 0;
  let receiverUserName = "";
  let creditedCents = 0;
  let appliedToDebt = 0;

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const source = await tx.account.findFirst({
        where: { id: fromAccountId, userId: user.id },
        select: { id: true, name: true, balanceCents: true, createdAt: true, user: { select: { name: true, email: true } } },
      });

      if (!source) {
        dashRedirect({ transferError: "Source account not found" });
      }

      const candidates = await tx.account.findMany({
        where: { userId: { not: user.id } },
        select: {
          id: true,
          name: true,
          balanceCents: true,
          createdAt: true,
          userId: true,
          user: { select: { name: true, email: true } },
        },
      });

      const scored: { acct: typeof candidates[number]; score: number }[] = [];

      for (const acct of candidates) {
        const nAcct = normalize(acct.name);
        const nOwner = normalize(acct.user.name);
        const combined = normalize(`${acct.name} ${acct.user.name}`);
        let score = 0;

        if (parsedCombo) {
          const nPartAcct = normalize(parsedCombo.accountPart);
          const nPartOwner = normalize(parsedCombo.ownerPart);
          if (nAcct === nPartAcct && nOwner === nPartOwner) score = 100;
          else if (nAcct === nPartAcct && combined.includes(nPartOwner)) score = 80;
          else if (nOwner === nPartOwner && combined.includes(nPartAcct)) score = 80;
        }

        if (score === 0) {
          if (nAcct === normalizedRaw) score = 70;
          else if (nOwner === normalizedRaw) score = 60;
          else if (combined === normalizedRaw) score = 55;
          else if (nAcct.includes(normalizedRaw)) score = 30;
          else if (nOwner.includes(normalizedRaw)) score = 25;
          else if (combined.includes(normalizedRaw)) score = 20;
        }

        if (score > 0) {
          scored.push({ acct, score });
        }
      }

      if (scored.length === 0) {
        dashRedirect({ transferError: "No account or owner with that name" });
      }

      scored.sort((a, b) => b.score - a.score || a.acct.id - b.acct.id);
      const topScore = scored[0].score;
      const top = scored.filter((s) => s.score === topScore);

      if (top.length > 1) {
        dashRedirect({ transferError: "Multiple matches for that name" });
      }

      const target = top[0].acct;

      if (target.id === source.id) {
        dashRedirect({ transferError: "Cannot transfer to the same account" });
      }

      const settledSource = await ensureOverdraftProgress(tx, source);
      const senderNext = settledSource.balanceCents - deltaCents;
      const settledTarget = target.balanceCents < 0 ? await ensureOverdraftProgress(tx, target) : { balanceCents: target.balanceCents, anchorDate: target.createdAt };

      const isMostafaTarget = target.user.name.toLowerCase().includes("mostafa");
      const mostafaDebt = isMostafaTarget ? await getOrCreateMostafaDebtAccount(tx, target.userId) : null;

      const skipPaydown = !!skipDebtPaydown;
      appliedToDebt = !skipPaydown && mostafaDebt ? Math.min(deltaCents, Math.max(0, mostafaDebt.balanceCents)) : 0;
      creditedCents = deltaCents - appliedToDebt;

      const receiverNext = settledTarget.balanceCents + creditedCents;
      sourceAccountName = source.name;
      senderBalanceAfter = senderNext;
      counterpartyName = `${target.name} (${target.user.name})`;
      receiverAccountName = target.name;
      receiverEmail = target.user.email;
      receiverBalanceAfter = receiverNext;
      receiverUserName = target.user.name;

      if (settledSource.balanceCents >= 0 && senderNext < 0) {
        await recordOverdraftAlert(tx, source.id, senderNext, `Transfer to ${target.name}`);
      }

      await tx.account.update({
        where: { id: source.id },
        data: { balanceCents: senderNext },
      });

      await tx.account.update({
        where: { id: target.id },
        data: { balanceCents: receiverNext },
      });

      if (appliedToDebt > 0 && mostafaDebt) {
        const nextDebt = Math.max(0, mostafaDebt.balanceCents - appliedToDebt);
        await tx.account.update({ where: { id: mostafaDebt.id }, data: { balanceCents: nextDebt } });

        await tx.transaction.create({
          data: {
            accountId: mostafaDebt.id,
            type: "DEBT_PAYDOWN",
            amountCents: appliedToDebt,
            description: `Paydown from transfer to ${target.name}`,
            balanceAfterCents: nextDebt,
            source: `From: ${source.name}`,
          },
        });
      }

      const outgoingDescription = description?.slice(0, 120) || `Transfer to ${target.name}`;
      const incomingDescription = description?.slice(0, 120) || `Transfer from ${source.name}`;

      await tx.transaction.create({
        data: {
          accountId: source.id,
          type: "TRANSFER_OUT",
          amountCents: deltaCents,
          description: outgoingDescription,
          balanceAfterCents: senderNext,
          source: `To: ${target.name}`,
        },
      });

      if (creditedCents > 0) {
        await tx.transaction.create({
          data: {
            accountId: target.id,
            type: "TRANSFER_IN",
            amountCents: creditedCents,
            description: incomingDescription,
            balanceAfterCents: receiverNext,
            source: `From: ${source.name}`,
          },
        });
      }
    });
  } catch (err) {
    const isNextRedirect =
      err && typeof err === "object" && "digest" in err && typeof (err as any).digest === "string" && (err as any).digest.startsWith("NEXT_REDIRECT");
    if (isNextRedirect) {
      throw err;
    }
    dashRedirect({ transferError: "Transfer failed" });
  }

  await sendTransactionEmail({
    to: user.email,
    userName: user.name,
    accountName: sourceAccountName || "Account",
    type: "TRANSFER_OUT",
    amountCents: deltaCents,
    balanceAfterCents: senderBalanceAfter,
    description,
    source: counterpartyName ? `To: ${counterpartyName}` : undefined,
    counterparty: counterpartyName || undefined,
    timestamp: new Date(),
  });

  if (receiverEmail && creditedCents > 0) {
    await sendTransactionEmail({
      to: receiverEmail,
      userName: receiverUserName || "Customer",
      accountName: receiverAccountName || "Account",
      type: "TRANSFER_IN",
      amountCents: creditedCents,
      balanceAfterCents: receiverBalanceAfter,
      description,
      source: sourceAccountName ? `From: ${sourceAccountName}` : undefined,
      counterparty: sourceAccountName ? `${sourceAccountName} (${user.name})` : undefined,
      timestamp: new Date(),
    });
  }

  revalidateBankViews();
  dashRedirect({ transferSuccess: "Sent" });
}

export async function adminDeleteTransaction(formData: FormData) {
  const parsed = deleteTxnSchema.safeParse({
    transactionId: formData.get("transactionId"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) return;

  const adminUser = await requireAdmin();
  if (!adminUser) return;

  const { transactionId, reason } = parsed.data;

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.transaction.findUnique({
        where: { id: transactionId },
        select: { deletedAt: true },
      });

      if (!existing || existing.deletedAt) return;

      await tx.transaction.update({
        where: { id: transactionId },
        data: {
          deletedAt: new Date(),
          deletedByUserId: adminUser.id,
          deletionReason: reason?.trim() ? reason.trim().slice(0, 200) : null,
        },
      });
    });
  } catch {
    return;
  }

  revalidateBankViews();
}

export async function adminDeleteTransactionsBulk(formData: FormData) {
  const parsed = deleteTxnBulkSchema.safeParse({
    transactionIds: formData.getAll("transactionIds"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) return;

  const adminUser = await requireAdmin();
  if (!adminUser) return;

  const ids = Array.from(new Set(parsed.data.transactionIds));
  const reason = parsed.data.reason?.trim() ? parsed.data.reason.trim().slice(0, 200) : null;

  try {
    await prisma.transaction.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date(), deletedByUserId: adminUser.id, deletionReason: reason },
    });
  } catch {
    return;
  }

  revalidateBankViews();
}

export async function adminClearAuditTrail(formData: FormData) {
  const parsed = clearAuditSchema.safeParse({ confirm: formData.get("confirm") });
  if (!parsed.success) return;

  const adminUser = await requireAdmin();
  if (!adminUser) return;

  if (parsed.data.confirm !== "clear") return;

  try {
    await prisma.transaction.deleteMany({ where: { deletedAt: { not: null } } });
  } catch {
    return;
  }

  revalidateBankViews();
  revalidatePath("/admin");
}

export async function updateMostafaDebt(formData: FormData) {
  const parsed = adjustMostafaDebtSchema.safeParse({
    amount: formData.get("amount"),
    direction: formData.get("direction"),
  });

  if (!parsed.success) return;

  const user = await getCurrentUser();
  if (!user || !user.isVerified) return;

  const adminUser = await requireDomainAdmin();
  const isMostafaUser = user.name.toLowerCase().includes("mostafa");
  if (!isMostafaUser && !adminUser) return;

  const mostafaUser = isMostafaUser
    ? user
    : await prisma.user.findFirst({ where: { name: { contains: "Mostafa", mode: "insensitive" } } });

  if (!mostafaUser) return;

  const deltaCents = Math.round(parsed.data.amount * 100);
  if (deltaCents <= 0) return;

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const debtAccount = await getOrCreateMostafaDebtAccount(tx, mostafaUser.id);

      let nextBalance = debtAccount.balanceCents;
      if (parsed.data.direction === "add") {
        nextBalance = debtAccount.balanceCents + deltaCents;
      } else {
        nextBalance = Math.max(0, debtAccount.balanceCents - deltaCents);
      }

      if (nextBalance === debtAccount.balanceCents) return;

      await tx.account.update({ where: { id: debtAccount.id }, data: { balanceCents: nextBalance } });

      await tx.transaction.create({
        data: {
          accountId: debtAccount.id,
          type: parsed.data.direction === "add" ? "DEBT_ADD" : "DEBT_PAY",
          amountCents: deltaCents,
          description: parsed.data.direction === "add" ? "Debt increased" : "Debt payment",
          balanceAfterCents: nextBalance,
          source: isMostafaUser ? "Mostafa debt control" : "Admin debt control",
        },
      });
    });
  } catch {
    return;
  }

  revalidateBankViews();
  revalidatePath("/dashboard");
  revalidatePath("/admin");
}

export async function adminCreateAnnouncementSchedule(formData: FormData) {
  const parsed = announcementScheduleSchema.safeParse({
    title: formData.get("title"),
    titleAr: formData.get("titleAr"),
    body: formData.get("body"),
    bodyAr: formData.get("bodyAr"),
    mediaUrl: formData.get("mediaUrl"),
    youtubeUrl: formData.get("youtubeUrl"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    status: formData.get("status"),
    publishNow: formData.get("publishNow"),
  });

  if (!parsed.success) {
    console.log("adminCreateAnnouncementSchedule:parseError", parsed.error.flatten());
    return;
  }

  console.log("adminCreateAnnouncementSchedule:start", parsed.data);

  const adminUser = await requireAdmin();
  if (!adminUser) {
    console.log("adminCreateAnnouncementSchedule:noAdmin");
    return;
  }

  const available = await isAnnouncementScheduleAvailable();
  if (!available) {
    console.log("adminCreateAnnouncementSchedule:unavailableModel");
    return;
  }

  const publishNow = parsed.data.publishNow === "1";
  const startsAt = publishNow ? new Date() : parseDateInput(parsed.data.startsAt) ?? new Date();
  const endsAt = parseDateInput(parsed.data.endsAt);
  if (endsAt && endsAt <= startsAt) {
    console.log("adminCreateAnnouncementSchedule:endsBeforeStart", { startsAt, endsAt });
    return;
  }

  const youtubeId = extractYoutubeId(parsed.data.youtubeUrl);
  const status = resolveScheduleStatus(parsed.data.status, publishNow);

  const created = await prisma.announcementSchedule.create({
    data: {
      title: parsed.data.title.trim(),
      titleAr: parsed.data.titleAr?.trim() || null,
      body: parsed.data.body?.trim() || null,
      bodyAr: parsed.data.bodyAr?.trim() || null,
      mediaUrl: parsed.data.mediaUrl?.trim() || null,
      youtubeId,
      startsAt,
      endsAt,
      status,
    },
  });

  console.log("adminCreateAnnouncementSchedule:created", created);

  revalidatePath("/dashboard");
  revalidatePath("/admin");

  redirect("/admin?announcementScheduled=1");
}

export async function adminUpdateAnnouncementSchedule(formData: FormData) {
  const parsed = announcementScheduleUpdateSchema.safeParse({
    id: formData.get("id"),
    title: formData.get("title"),
    titleAr: formData.get("titleAr"),
    body: formData.get("body"),
    bodyAr: formData.get("bodyAr"),
    mediaUrl: formData.get("mediaUrl"),
    youtubeUrl: formData.get("youtubeUrl"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    status: formData.get("status"),
    publishNow: formData.get("publishNow"),
  });

  if (!parsed.success) {
    console.log("adminUpdateAnnouncementSchedule:parseError", parsed.error.flatten());
    return;
  }

  const adminUser = await requireAdmin();
  if (!adminUser) {
    console.log("adminUpdateAnnouncementSchedule:noAdmin");
    return;
  }

  const available = await isAnnouncementScheduleAvailable();
  if (!available) {
    console.log("adminUpdateAnnouncementSchedule:unavailableModel");
    return;
  }

  const existing = await prisma.announcementSchedule.findUnique({ where: { id: parsed.data.id } });
  if (!existing) {
    console.log("adminUpdateAnnouncementSchedule:notFound", parsed.data.id);
    return;
  }

  const publishNow = parsed.data.publishNow === "1";
  const startsAt = publishNow ? new Date() : parseDateInput(parsed.data.startsAt) ?? existing.startsAt;
  const endsAt = parseDateInput(parsed.data.endsAt) ?? existing.endsAt;
  if (endsAt && endsAt <= startsAt) return;

  const youtubeId = extractYoutubeId(parsed.data.youtubeUrl) ?? existing.youtubeId ?? null;
  const status = resolveScheduleStatus(parsed.data.status ?? existing.status, publishNow);

  await prisma.announcementSchedule.update({
    where: { id: existing.id },
    data: {
      title: parsed.data.title.trim(),
      titleAr: parsed.data.titleAr?.trim() || null,
      body: parsed.data.body?.trim() || null,
      bodyAr: parsed.data.bodyAr?.trim() || null,
      mediaUrl: parsed.data.mediaUrl?.trim() || null,
      youtubeId,
      startsAt,
      endsAt,
      status,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/admin");

  redirect("/admin?announcementUpdated=1");
}

export async function adminPublishAnnouncementNow(formData: FormData) {
  const parsed = announcementScheduleIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    console.log("adminPublishAnnouncementNow:parseError", parsed.error.flatten());
    return;
  }

  const adminUser = await requireAdmin();
  if (!adminUser) {
    console.log("adminPublishAnnouncementNow:noAdmin");
    return;
  }

  const available = await isAnnouncementScheduleAvailable();
  if (!available) {
    console.log("adminPublishAnnouncementNow:unavailableModel");
    return;
  }

  const now = new Date();

  await prisma.announcementSchedule.update({ where: { id: parsed.data.id }, data: { startsAt: now, status: "ACTIVE" } });

  revalidatePath("/dashboard");
  revalidatePath("/admin");
}

export async function adminCancelAnnouncementSchedule(formData: FormData) {
  const parsed = announcementScheduleIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    console.log("adminCancelAnnouncementSchedule:parseError", parsed.error.flatten());
    return;
  }

  const adminUser = await requireDomainAdmin();
  if (!adminUser) {
    console.log("adminCancelAnnouncementSchedule:noDomainAdmin");
    return;
  }

  const available = await isAnnouncementScheduleAvailable();
  if (!available) {
    console.log("adminCancelAnnouncementSchedule:unavailableModel");
    return;
  }

  await prisma.announcementSchedule.update({ where: { id: parsed.data.id }, data: { status: "CANCELLED" } });

  revalidatePath("/dashboard");
  revalidatePath("/admin");
}

export async function adminDeleteAnnouncementSchedule(formData: FormData) {
  const parsed = announcementScheduleIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    console.log("adminDeleteAnnouncementSchedule:parseError", parsed.error.flatten());
    return;
  }

  const adminUser = await requireDomainAdmin();
  if (!adminUser) {
    console.log("adminDeleteAnnouncementSchedule:noDomainAdmin");
    return;
  }

  const available = await isAnnouncementScheduleAvailable();
  if (!available) {
    console.log("adminDeleteAnnouncementSchedule:unavailableModel");
    return;
  }

  await prisma.announcementSchedule.delete({ where: { id: parsed.data.id } });

  revalidatePath("/dashboard");
  revalidatePath("/admin");
}

export async function adminSetAnnouncement(formData: FormData) {
  // Backwards-compatible: publish immediately as an active schedule entry.
  const parsed = announcementSchema.safeParse({
    title: formData.get("title"),
    titleAr: formData.get("titleAr"),
    body: formData.get("body"),
    bodyAr: formData.get("bodyAr"),
    mediaUrl: formData.get("mediaUrl"),
    youtubeUrl: formData.get("youtubeUrl"),
  });

  if (!parsed.success) {
    console.log("adminSetAnnouncement:parseError", parsed.error.flatten());
    return;
  }

  const adminUser = await requireAdmin();
  if (!adminUser) {
    console.log("adminSetAnnouncement:noAdmin");
    return;
  }

  const scheduleAvailable = await isAnnouncementScheduleAvailable();
  if (!scheduleAvailable) {
    console.log("adminSetAnnouncement:unavailableModel");
    return;
  }

  const youtubeId = extractYoutubeId(parsed.data.youtubeUrl);
  const now = new Date();

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.announcement.deleteMany();
    await tx.announcementSchedule.create({
      data: {
        title: parsed.data.title.trim(),
        titleAr: parsed.data.titleAr?.trim() || null,
        body: parsed.data.body?.trim() || null,
        bodyAr: parsed.data.bodyAr?.trim() || null,
        mediaUrl: parsed.data.mediaUrl?.trim() || null,
        youtubeId,
        startsAt: now,
        status: "ACTIVE",
      },
    });
  });

  revalidatePath("/dashboard");
  revalidatePath("/admin");

  redirect("/admin?announcementPublished=1");
}

export async function adminDeleteAnnouncement() {
  const adminUser = await requireDomainAdmin();
  if (!adminUser) {
    console.log("adminDeleteAnnouncement:noDomainAdmin");
    return;
  }

  const scheduleAvailable = await isAnnouncementScheduleAvailable();
  if (!scheduleAvailable) {
    console.log("adminDeleteAnnouncement:unavailableModel");
    return;
  }

  const now = new Date();
  const active = await prisma.announcementSchedule.findFirst({
    where: {
      status: { in: ["SCHEDULED", "ACTIVE"] },
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    orderBy: [{ startsAt: "desc" }, { updatedAt: "desc" }],
  });

  if (active) {
    await prisma.announcementSchedule.update({ where: { id: active.id }, data: { status: "CANCELLED" } });
  }

  await prisma.announcement.deleteMany();
  revalidatePath("/dashboard");
  revalidatePath("/admin");
}

export async function adminDeleteUser(formData: FormData) {
  const parsed = deleteUserSchema.safeParse({
    userId: formData.get("userId"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) return;

  const adminUser = await requireDomainAdmin();
  if (!adminUser) return;

  const { userId } = parsed.data;

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, isAdmin: true, email: true, name: true } });
  if (!target) return;

  // Protect domain admin and self from accidental deletion.
  const isDomainAdmin = domainAdminEmail ? target.email.toLowerCase() === domainAdminEmail : false;
  if (isDomainAdmin || target.id === adminUser.id) return;

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const accounts = await tx.account.findMany({ where: { userId }, select: { id: true } });
      const accountIds = accounts.map((a) => a.id);

      if (accountIds.length) {
        await tx.transaction.deleteMany({ where: { accountId: { in: accountIds } } });
        await tx.account.deleteMany({ where: { id: { in: accountIds } } });
      }

      await tx.request.deleteMany({ where: { OR: [{ requesterId: userId }, { targetUserId: userId }] } });
      await tx.session.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    });
  } catch {
    return;
  }

  revalidateBankViews();
  revalidatePath("/");
}

export async function adminUpdateAccount(formData: FormData) {
  const rawName = (formData.get("name") as string | null)?.trim() || "";
  const rawBalance = (formData.get("balance") as string | null)?.trim() || "";
  const rawOwnerUserId = (formData.get("ownerUserId") as string | null)?.trim() || "";
  const rawCreatedAt = (formData.get("createdAt") as string | null)?.trim() || "";
  const rawDescription = (formData.get("description") as string | null)?.trim() || "";

  const parsed = z
    .object({
      accountId: idSchema,
      name: z.string().trim().min(1).max(60).optional(),
      balance: adminMoneySchema.optional(),
      ownerUserId: idSchema.optional(),
      createdAt: z.string().trim().optional(),
      description: z.string().optional(),
    })
    .safeParse({
      accountId: formData.get("accountId"),
      name: rawName || undefined,
      balance: rawBalance || undefined,
      ownerUserId: rawOwnerUserId || undefined,
      createdAt: rawCreatedAt || undefined,
      description: rawDescription || undefined,
    });

  if (!parsed.success) return;

  const adminUser = await requireDomainAdmin();
  if (!adminUser) return;

  const { accountId, name, balance, ownerUserId, createdAt, description } = parsed.data;

  let parsedCreatedAt: Date | undefined;
  if (createdAt) {
    const asDate = new Date(createdAt);
    if (!Number.isNaN(asDate.getTime())) {
      parsedCreatedAt = asDate;
    }
  }

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.account.findUnique({
        where: { id: accountId },
        select: { balanceCents: true },
      });

      if (!existing) {
        throw new Error("Account not found");
      }

      const updateData: Record<string, unknown> = {};

      if (name) updateData.name = name.slice(0, 60);
      if (ownerUserId) updateData.userId = ownerUserId;
      if (parsedCreatedAt) updateData.createdAt = parsedCreatedAt;

      let newBalanceCents = existing.balanceCents;
      let diffCents = 0;

      if (balance !== undefined) {
        newBalanceCents = Math.round(balance * 100);
        diffCents = newBalanceCents - existing.balanceCents;
        updateData.balanceCents = newBalanceCents;
      }

      if (Object.keys(updateData).length === 0) {
        return;
      }

      await tx.account.update({ where: { id: accountId }, data: updateData });
      if (balance !== undefined) {
        await tx.transaction.create({
          data: {
            accountId,
            type: "ADMIN_ADJUST",
            amountCents: Math.abs(diffCents),
            description: description?.slice(0, 120) || "Admin balance adjustment",
            balanceAfterCents: newBalanceCents,
            source: diffCents >= 0 ? "Admin credit" : "Admin debit",
          },
        });
      }
    });
  } catch {
    return;
  }

  revalidateBankViews();
}

export async function adminRenumberAccount(formData: FormData) {
  const parsed = renumberAccountSchema.safeParse({
    accountId: formData.get("accountId"),
    newAccountId: formData.get("newAccountId"),
  });

  if (!parsed.success) return;

  const adminUser = await requireDomainAdmin();
  if (!adminUser) return;

  const { accountId, newAccountId } = parsed.data;
  if (accountId === newAccountId) return;

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const source = await tx.account.findUnique({ where: { id: accountId }, select: { id: true, name: true, balanceCents: true, createdAt: true, userId: true } });
      if (!source) return;

      const targetExists = await tx.account.findUnique({ where: { id: newAccountId }, select: { id: true } });
      if (targetExists) {
        throw new Error("Target account number already exists");
      }

      await tx.account.create({
        data: {
          id: newAccountId,
          name: source.name,
          balanceCents: source.balanceCents,
          createdAt: source.createdAt,
          userId: source.userId,
        },
      });

      await tx.transaction.updateMany({ where: { accountId }, data: { accountId: newAccountId } });
      await tx.transaction.create({
        data: {
          accountId: newAccountId,
          type: "ADMIN_RENUMBER",
          amountCents: 0,
          description: `Admin renumbered account #${accountId} to #${newAccountId}`,
          balanceAfterCents: source.balanceCents,
          source: "Admin renumber",
        },
      });
      await tx.account.delete({ where: { id: accountId } });

      if (process.env.DATABASE_URL?.toLowerCase().startsWith("postgres")) {
        try {
          await tx.$executeRaw`SELECT setval(pg_get_serial_sequence('"Account"', 'id'), (SELECT COALESCE(MAX(id), 1) FROM "Account"))`;
        } catch {
          // noop: sequence adjustment best-effort
        }
      }
    });
  } catch {
    return;
  }

  revalidateBankViews();
  revalidatePath("/admin");
}
