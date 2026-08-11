import { execSync } from 'child_process';

try {
  console.log('=== Running seed.ts (system entities) ===\n');
  execSync('ts-node prisma/seed.ts', { stdio: 'inherit' });

  console.log('\n=== Running seed-dev.ts (dev environment) ===\n');
  execSync('ts-node prisma/seed-dev.ts', { stdio: 'inherit' });

  console.log('\nAll seeding completed successfully!');
} catch (e) {
  console.error('Seed failed:', e.message);
  process.exit(1);
}
