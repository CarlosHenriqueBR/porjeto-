// Recria o banco do zero (apaga tudo). Use: npm run seed
import { seedDb } from '../api/_lib/store.js';

const db = await seedDb();
console.log('Central Operation inicializada.\n');
console.log('Acessos (todos owners, com acesso total):');
for (const u of db.users) console.log(`  ${u.name.padEnd(18)} ${u.email}`);
console.log(`\nSenha inicial: ${process.env.SEED_PASSWORD || 'Operacao@2026'}`);
console.log('Cada pessoa é obrigada a trocar no primeiro acesso.');
