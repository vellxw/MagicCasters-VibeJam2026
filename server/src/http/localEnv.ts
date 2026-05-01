import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

type Env = NodeJS.ProcessEnv | Record<string, string | undefined>;

export function loadLocalEnv(root = process.cwd(), env: Env = process.env): void {
  for (const path of resolveLocalEnvPaths(root)) {
    if (!existsSync(path)) continue;

    const parsed = parseLocalEnv(readFileSync(path, 'utf8'), env);
    for (const [key, value] of Object.entries(parsed)) {
      env[key] = value;
    }
  }
}

export function resolveLocalEnvPaths(root = process.cwd()): string[] {
  const paths = [join(root, '.env')];
  const parent = dirname(root);
  if (parent !== root && ['client', 'server'].includes(basename(root))) {
    paths.push(join(parent, '.env'));
  }
  return paths;
}

export function parseLocalEnv(source: string, existingEnv: Env): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (existingEnv[key] !== undefined) continue;
    parsed[key] = unquote(rawValue.trim());
  }
  return parsed;
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
