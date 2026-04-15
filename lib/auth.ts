import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { cookies } from "next/headers";
import { sendVerificationEmail } from "@/lib/email";
import prisma from "@/lib/prisma";

const SESSION_COOKIE = "session_token";
const SESSION_TTL_HOURS = 12;
const VERIFICATION_TTL_MINUTES = 10;
function generateVerificationCode() {
  const code = crypto.randomInt(100000, 999999);
  return String(code);
}

export async function createUser(email: string, name: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 10);
  const verificationCode = generateVerificationCode();
  const verificationExpires = new Date(Date.now() + VERIFICATION_TTL_MINUTES * 60 * 1000);

  const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const userCount = await tx.user.count();
    const createdUser = await tx.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        passwordHash,
        isAdmin: userCount === 0,
        isVerified: false,
        verificationCode,
        verificationExpires,
      },
    });

    // Create a default account tied to the user's identity so they can transact immediately.
    const accountName = name?.trim() || email;
    await tx.account.create({
      data: {
        name: accountName,
        userId: createdUser.id,
      },
    });

    return createdUser;
  });

  void sendVerificationEmail(email, verificationCode);

  return user;
}

export async function verifyUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.passwordHash) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return user;
}

async function createSession(userId: number) {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);
  await prisma.session.create({ data: { token, userId, expiresAt } });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return;
  await prisma.session.updateMany({
    where: { token },
    data: { revoked: true },
  });
  cookieStore.delete(SESSION_COOKIE);
}

export async function signIn(email: string, password: string) {
  const user = await verifyUser(email, password);
  if (!user) return null;
  await createSession(user.id);
  return user;
}

export async function signUp(email: string, name: string, password: string) {
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) return null;
  const user = await createUser(email, name, password);
  await createSession(user.id);
  return user;
}

export async function verifyEmailCode(email: string, code: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.verificationCode || !user.verificationExpires) return false;
  if (user.isVerified) return true;
  if (user.verificationCode !== code) return false;
  if (user.verificationExpires < new Date()) return false;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      isVerified: true,
      verificationCode: null,
      verificationExpires: null,
    },
  });

  return true;
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findFirst({
    where: { token, revoked: false, expiresAt: { gt: new Date() } },
    include: { user: true },
  });
  return session?.user ?? null;
}
