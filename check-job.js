const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const jobs = await prisma.job.findMany({
    where: { title: { contains: 'Public Test Engineer' } },
    select: { id: true, title: true, slug: true, status: true, visibility: true, publishedAt: true, companyId: true }
  });
  console.log(JSON.stringify(jobs, null, 2));
  await prisma.$disconnect();
}

main().catch(console.error);