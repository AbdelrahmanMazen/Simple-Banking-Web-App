import prisma from "@/lib/prisma";

export const DEMO_EMAIL = "demo@simplebank.local";

export async function ensureDemoUserAndAccount() {
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: {
      email: DEMO_EMAIL,
      name: "Demo Customer",
    },
  });

  const existingAccount = await prisma.account.findFirst({ where: { userId: user.id } });

  if (!existingAccount) {
    await prisma.account.create({
      data: {
        name: "Checking",
        userId: user.id,
      },
    });
  }

  return user;
}
