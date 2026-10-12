/**
 * Create (or reset) an admin account.
 *   ADMIN_EMAIL=you@gyftr.net ADMIN_NAME="Your Name" ADMIN_PASSWORD='...' npm run admin:create
 * The password must satisfy the same policy as the panel (12+ chars, letters and digits).
 */
import { PrismaClient } from '@prisma/client';
import { createUserInputSchema } from '../src/contracts';
import { BcryptPasswordHasher } from '../src/services/security';

async function main() {
  const input = createUserInputSchema.parse({
    email: process.env.ADMIN_EMAIL,
    name: process.env.ADMIN_NAME ?? 'Administrator',
    role: 'ADMIN',
    password: process.env.ADMIN_PASSWORD,
  });
  const prisma = new PrismaClient();
  try {
    const passwordHash = await new BcryptPasswordHasher().hash(input.password);
    const user = await prisma.user.upsert({
      where: { email: input.email },
      update: { passwordHash, role: 'ADMIN', isActive: true, tokenVersion: { increment: 1 } },
      create: { email: input.email, name: input.name, role: 'ADMIN', passwordHash },
    });
    console.log(`Admin ready: ${user.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
