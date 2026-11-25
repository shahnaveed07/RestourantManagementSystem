import { seedDatabase } from './seedData.js';
import { repo } from '../db/repository.js';

async function main() {
  const summary = await seedDatabase(true);
  console.log('\n=== Passline Seed Complete ===');
  console.log(`Storage engine: ${repo.getEngine()}`);
  console.log(`Categories: ${summary.categoriesCount} | Menu Items: ${summary.menuItemsCount} | Orders: ${summary.ordersCount}`);
  console.log('\nDemo Accounts:');
  for (const u of summary.users) {
    if (u.role === 'customer') {
      console.log(`  [${u.role.toUpperCase().padEnd(8)}] ${u.email.padEnd(20)} | ${u.mobile || ''} (OTP: 123456)`);
    } else {
      console.log(`  [${u.role.toUpperCase().padEnd(8)}] ${u.email.padEnd(20)} / ${u.password}`);
    }
  }
  console.log('\nTable QR Tokens (/t/<token>):');
  for (const t of summary.tables) {
    console.log(`  Table ${String(t.number).padStart(2, '0')} (${t.section.padEnd(13)}): /t/${t.qrToken}`);
  }
  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
