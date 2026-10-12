import { loadSecretsIntoEnv } from '../config/secrets';

// Entry for `node dist/create-admin.js` in deployed environments: settings come from Secrets Manager.
await loadSecretsIntoEnv();
await import('../../scripts/create-admin');
