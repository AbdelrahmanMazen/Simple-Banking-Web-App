const { PrismaClient } = require('../node_modules/@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const accounts = await prisma.account.findMany({
      include: { user: true, _count: { select: { transactions: true } } },
      orderBy: { id: 'asc' },
    });
    if (accounts.length === 0) {
      console.log('No accounts found.');
      return;
    }
    for (const acct of accounts) {
      console.log(`Account #${acct.id}: ${acct.name}`);
      console.log(`  Owner: ${acct.user.name} <${acct.user.email}> (user ${acct.userId})`);
      console.log(`  Balance: EGP ${(acct.balanceCents / 100).toFixed(2)}`);
      console.log(`  Transactions: ${acct._count.transactions}`);
      console.log('');
    }
  } catch (err) {
    console.error('Error listing accounts:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
