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

const moneySchema = z
  .string()
  .trim()
  .transform((val) => Number(val))
  .pipe(z.number().positive());

const adminMoneySchema = z
  .string()
  .trim()
  .transform((val) => Number(val))
  .pipe(z.number().nonnegative());

const idSchema = z
  .string()
  .transform((val) => Number(val))
  .pipe(z.number().int().positive());

const deleteTxnSchema = z.object({
  transactionId: idSchema,
  reason: z.string().trim().max(200).optional(),
});

const targetAccountNameSchema = z.string().trim().min(1).max(60);
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

const domainAdminEmail = process.env.DOMAIN_ADMIN_EMAIL?.toLowerCase();

async function requireDomainAdmin() {
  const user = await getCurrentUser();
  if (!user || !user.isAdmin) return null;
  if (domainAdminEmail && user.email.toLowerCase() !== domainAdminEmail) return null;
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
      description: z.string().optional(),
      source: z.enum(["Mobile Wallet", "Credit/Debit Card"]),
    })
    .safeParse({
      accountId: formData.get("accountId"),
      amount: formData.get("amount"),
      description: formData.get("description"),
      source: formData.get("source"),
    });

  if (!parsed.success) {
    dashRedirect({ depositError: "Invalid deposit request" });
  }

  const { accountId, amount, description, source } = parsed.data;
  const deltaCents = Math.round(amount * 100);
  let accountName = "";
  let balanceAfterCents = 0;
  const user = await getCurrentUser();
  if (!user || !user.isVerified) {
    dashRedirect({ depositError: "You must be signed in and verified" });
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
          description: description?.slice(0, 120) || "Deposit",
          balanceAfterCents: nextBalance,
          source,
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
    source,
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
    })
    .safeParse({
      fromAccountId: formData.get("fromAccountId"),
      toAccountName: formData.get("toAccountName"),
      amount: formData.get("amount"),
      description: formData.get("description"),
    });

  if (!parsed.success) {
    dashRedirect({ transferError: "Invalid transfer request" });
  }

  const { fromAccountId, toAccountName, amount, description } = parsed.data;
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
      const receiverNext = settledTarget.balanceCents + deltaCents;
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

      await tx.transaction.create({
        data: {
          accountId: target.id,
          type: "TRANSFER_IN",
          amountCents: deltaCents,
          description: incomingDescription,
          balanceAfterCents: receiverNext,
          source: `From: ${source.name}`,
        },
      });
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

  if (receiverEmail) {
    await sendTransactionEmail({
      to: receiverEmail,
      userName: receiverUserName || "Customer",
      accountName: receiverAccountName || "Account",
      type: "TRANSFER_IN",
      amountCents: deltaCents,
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

  const adminUser = await requireDomainAdmin();
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
