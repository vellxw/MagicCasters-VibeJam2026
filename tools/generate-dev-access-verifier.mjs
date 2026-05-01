#!/usr/bin/env node
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const ITERATIONS = 210000;
const KEY_LENGTH_BYTES = 32;
const SALT_LENGTH_BYTES = 16;

const args = new Set(process.argv.slice(2));

const password = await readPassword();
if (!password) {
  console.error('No password provided.');
  process.exit(1);
}

const salt = randomBytes(SALT_LENGTH_BYTES).toString('hex');
const key = pbkdf2Sync(password, Buffer.from(salt, 'hex'), ITERATIONS, KEY_LENGTH_BYTES, 'sha256').toString('hex');
const lines = [
  `DEV_ACCESS_PASSWORD_SALT=${salt}`,
  `DEV_ACCESS_PASSWORD_KEY=${key}`,
  `DEV_ACCESS_PASSWORD_ITERATIONS=${ITERATIONS}`
];

if (args.has('--write-env')) {
  writeVerifierToEnv(lines);
  console.log('Wrote DEV_ACCESS_PASSWORD_* verifier values to .env. The password itself was not written.');
} else {
  console.log(lines.join('\n'));
}

async function readPassword() {
  if (args.has('--password-stdin')) {
    return await readAllStdin();
  }

  const rl = createInterface({ input, output });
  try {
    const value = await rl.question('Dev access password: ');
    return value.trim();
  } finally {
    rl.close();
  }
}

async function readAllStdin() {
  let raw = '';
  input.setEncoding('utf8');
  for await (const chunk of input) {
    raw += chunk;
  }
  return raw.trim();
}

function writeVerifierToEnv(linesToWrite) {
  const envPath = '.env';
  const existing = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const removeKeys = new Set(linesToWrite.map((line) => line.slice(0, line.indexOf('='))));
  const kept = existing
    .split(/\r?\n/)
    .filter((line) => {
      const key = line.includes('=') ? line.slice(0, line.indexOf('=')) : '';
      return !removeKeys.has(key);
    })
    .filter((line, index, lines) => line.trim() || index < lines.length - 1);
  const next = [
    ...kept,
    ...(kept.length > 0 && kept[kept.length - 1]?.trim() ? [''] : []),
    ...linesToWrite
  ].join('\n');
  writeFileSync(envPath, `${next.trimEnd()}\n`);
}
