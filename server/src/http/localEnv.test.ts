import { describe, expect, it } from 'vitest';
import { parseLocalEnv } from './localEnv';

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
});
