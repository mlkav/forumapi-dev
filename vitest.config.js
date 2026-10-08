import { defineConfig } from 'vitest/config';

process.env.NODE_ENV = 'test';
process.env.TEST_PGDATABASE = 'forumapi_test';

export default defineConfig({
  test: {
    globals: true,
    env: {
      NODE_ENV: 'test',
      TEST_PGDATABASE: 'forumapi_test',
    },
    setupFiles: ['dotenv/config'],
    fileParallelism: false,
    coverage: {
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});