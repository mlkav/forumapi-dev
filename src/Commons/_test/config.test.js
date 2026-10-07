import { vi } from 'vitest';
import {
  assertTestDatabase,
  getTestDatabaseName,
  isTestEnvironment,
} from '../config.js';

describe('configuration outside the test environment', () => {
  it('should validate database isolation only in the test environment', () => {
    expect(getTestDatabaseName()).toBe('forumapi_test');
    expect(getTestDatabaseName('custom_test')).toBe('custom_test');
    expect(() => assertTestDatabase(false, 'forumapi')).not.toThrow();
    expect(() => assertTestDatabase(true, 'forumapi_test')).not.toThrow();
    expect(() => assertTestDatabase(true, 'forumapi')).toThrow(
      'TEST_PGDATABASE must use a database name ending in "_test"',
    );
  });

  it('should recognize test and non-test environments', () => {
    try {
      vi.stubEnv('NODE_ENV', 'test');
      expect(isTestEnvironment()).toBe(true);
      vi.stubEnv('NODE_ENV', 'development');
      expect(isTestEnvironment()).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('should load the default environment file outside tests', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    try {
      const { default: config } =
        await import('../config.js?development-coverage');

      expect(config.app.host).toBe('localhost');
      expect(config.app.debug).toEqual({ request: ['error'] });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('should use production host settings', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const { default: config } =
        await import('../config.js?production-coverage');

      expect(config.app.host).toBe('0.0.0.0');
      expect(config.app.debug).toEqual({});
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('should select the dedicated database and default access token lifetime in tests', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('TEST_PGDATABASE', 'forumapi_test');
    vi.stubEnv('ACCESS_TOKEN_AGE', '');
    try {
      const { default: config } =
        await import('../config.js?test-database-coverage');

      expect(config.database.database).toBe('forumapi_test');
      expect(config.database.database).not.toBe(process.env.PGDATABASE);
      expect(config.auth.accessTokenAge).toBe('1h');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('should reject a test database name that is not isolated', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('TEST_PGDATABASE', 'forumapi');
    try {
      await expect(
        import('../config.js?unsafe-test-database-coverage'),
      ).rejects.toThrow(
        'TEST_PGDATABASE must use a database name ending in "_test"',
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('should use a configured access token lifetime', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ACCESS_TOKEN_AGE', '15m');
    try {
      const { default: config } =
        await import('../config.js?configured-token-age-coverage');

      expect(config.auth.accessTokenAge).toBe('15m');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
