import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { parseLocalEnv, resolveLocalEnvPaths } from './localEnv';

describe('local env parsing', () => {
  it('parses simple dotenv values without overriding the caller environment', () => {
    expect(parseLocalEnv('PORT=3001\nDEV_ACCESS_PASSWORD_SALT=abc123\n# comment\nEMPTY=\n', {
      PORT: '9000'
    })).toEqual({
      DEV_ACCESS_PASSWORD_SALT: 'abc123',
      EMPTY: ''
    });
  });

  it('supports quoted values', () => {
    expect(parseLocalEnv('DEV_ACCESS_PASSWORD_KEY="aabbcc"\nSERVER_PORT=\'3001\'', {})).toEqual({
      DEV_ACCESS_PASSWORD_KEY: 'aabbcc',
      SERVER_PORT: '3001'
    });
  });

  it('also looks for the monorepo .env when running from a workspace package', () => {
    const workspaceRoot = join('C:', 'project', 'server');
    expect(resolveLocalEnvPaths(workspaceRoot)).toEqual([
      join(workspaceRoot, '.env'),
      join('C:', 'project', '.env')
    ]);
  });

  it('does not climb past non-workspace roots', () => {
    const repoRoot = join('C:', 'project');
    expect(resolveLocalEnvPaths(repoRoot)).toEqual([
      join(repoRoot, '.env')
    ]);
  });
});
