import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
    process.loadEnvFile('.env');
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}

const variables = {
    apiKey: 'NEXT_PUBLIC_FIREBASE_API_KEY',
    authDomain: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    projectId: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    messagingSenderId: 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    appId: 'NEXT_PUBLIC_FIREBASE_APP_ID'
};

const missing = Object.values(variables).filter(name => !process.env[name]);
if (missing.length > 0) {
    console.error(`Faltan variables de Firebase en .env: ${missing.join(', ')}`);
    process.exit(1);
}

const config = Object.fromEntries(
    Object.entries(variables).map(([property, name]) => [property, process.env[name]])
);
const outputPath = join(dirname(fileURLToPath(import.meta.url)), '../src/environments/firebase-config.generated.ts');

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `export const firebaseConfig = ${JSON.stringify(config, null, 2)} as const;\n`);
console.log('Configuración de Firebase preparada para Angular.');