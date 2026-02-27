// Rename any account named "Primary" to the owner's name (fallback to email)
// Usage: node scripts/renamePrimaryAccounts.js
const { PrismaClient } = require('@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  try {
    const targets = await prisma.account.findMany({
      where: { name: { equals: 'Primary', mode: 'insensitive' } },
      select: { id: true, name: true, user: { select: { name: true, email: true } } },
    });

    if (!targets.length) {
      console.log('No accounts named "Primary" found.');
      return;
    }

    console.log(`Found ${targets.length} account(s) to rename...`);

    for (const acct of targets) {
      const newName = (acct.user?.name?.trim() || acct.user?.email || 'Account').slice(0, 60);
      if (newName.toLowerCase() === acct.name.toLowerCase()) {
        console.log(`Skipping account ${acct.id}; name already matches owner.`);
        continue;
      }

      await prisma.account.update({ where: { id: acct.id }, data: { name: newName } });
      console.log(`Renamed account ${acct.id}: "${acct.name}" -> "${newName}"`);
    }
  } catch (err) {
    console.error('Rename failed:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
