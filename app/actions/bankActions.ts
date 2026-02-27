"use server";

import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sendTransactionEmail } from "@/lib/email";
import prisma from "@/lib/prisma";

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

const targetAccountNameSchema = z.string().trim().min(1).max(60);

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

    const deltaCents = Math.round(amount * 100);
    let accountName = "";
    let balanceAfterCents = 0;

  if (!parsed.success) {
    return;
  }

  const { accountId, amount, description, source } = parsed.data;
  const user = await getCurrentUser();
  if (!user || !user.isVerified) return;

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const account = await tx.account.findFirst({
        where: { id: accountId, userId: user.id },
        select: { id: true, balanceCents: true, name: true },
      });

      if (!account) {
        throw new Error("Account not found");
      }

      const nextBalance = account.balanceCents + deltaCents;
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
  } catch {
    return;
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

    const deltaCents = Math.round(amount * 100);
    let accountName = "";
    let balanceAfterCents = 0;

  if (!parsed.success) {
    return;
  }

  const { accountId, amount, description } = parsed.data;
  const user = await getCurrentUser();
  if (!user || !user.isVerified) return;

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const account = await tx.account.findFirst({
        where: { id: accountId, userId: user.id },
        select: { id: true, balanceCents: true, name: true },
      });

      if (!account) {
        throw new Error("Account not found");
      }

      if (account.balanceCents < deltaCents) {
        throw new Error("Insufficient funds");
      }

      const nextBalance = account.balanceCents - deltaCents;
      accountName = account.name;
      balanceAfterCents = nextBalance;

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
  } catch {
    return;
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

  if (!parsed.success) return;

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

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const source = await tx.account.findFirst({
        where: { id: fromAccountId, userId: user.id },
        select: { id: true, name: true, balanceCents: true },
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
          userId: true,
          user: { select: { name: true } },
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

      if (source.balanceCents < deltaCents) {
        dashRedirect({ transferError: "Insufficient funds" });
      }

      const senderNext = source.balanceCents - deltaCents;
      const receiverNext = target.balanceCents + deltaCents;
      sourceAccountName = source.name;
      senderBalanceAfter = senderNext;
      counterpartyName = `${target.name} (${target.user.name})`;

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

  revalidateBankViews();
  dashRedirect({ transferSuccess: "Sent" });
}

export async function adminUpdateAccount(formData: FormData) {
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
      name: formData.get("name"),
      balance: formData.get("balance"),
      ownerUserId: formData.get("ownerUserId"),
      createdAt: formData.get("createdAt"),
      description: formData.get("description"),
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
