import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'sarah@airecruiter.com';
  const normalizedEmail = email.trim().toLowerCase();
  const hash = await bcrypt.hash('admin123', 10);
  await prisma.user.update({
    where: { normalizedEmail },
    data: { email, normalizedEmail, passwordHash: hash, emailVerifiedAt: new Date() },
  });
  console.log('Password set to admin123, email verified');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
