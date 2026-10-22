import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/server/config.js';

const validEnv = {
  DATABASE_URL: 'postgres://envkeep:envkeep@localhost:5432/envkeep',
  ENVKEEP_MASTER_KEY: randomBytes(32).toString('base64'),
};

describe('loadConfig', () => {
  it('loads a valid config with defaults', () => {
    const config = loadConfig(validEnv);

    expect(config.port).toBe(8080);
    expect(config.host).toBe('0.0.0.0');
    expect(config.masterKey).toHaveLength(32);
  });

  it.each([
    ['missing master key', { ...validEnv, ENVKEEP_MASTER_KEY: undefined }],
    ['16-byte master key', { ...validEnv, ENVKEEP_MASTER_KEY: randomBytes(16).toString('base64') }],
    ['non-base64 master key', { ...validEnv, ENVKEEP_MASTER_KEY: 'not base64!' }],
    ['missing database url', { ...validEnv, DATABASE_URL: undefined }],
    ['invalid port', { ...validEnv, PORT: '99999' }],
  ])('rejects %s', (_, env) => {
    expect(() => loadConfig(env)).toThrow(ConfigError);
  });
});
