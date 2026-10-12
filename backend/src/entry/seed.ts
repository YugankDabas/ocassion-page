import { loadSecretsIntoEnv } from '../config/secrets';

// Entry for `node dist/seed.js` in deployed environments: settings come from Secrets Manager.
await loadSecretsIntoEnv();
await import('../../prisma/seed');
