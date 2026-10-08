import dotenv from 'dotenv';

dotenv.config();

export const getTestDatabaseName = (databaseName) => databaseName || 'forumapi_test';
const testDatabaseName = getTestDatabaseName(process.env.TEST_PGDATABASE);

export const isTestEnvironment = () => process.env.NODE_ENV === 'test';
const isTest = isTestEnvironment();

export const assertTestDatabase = (isTest, databaseName) => {
  if (isTest && !/_test$/i.test(databaseName)) {
    throw new Error('TEST_PGDATABASE must use a database name ending in "_test"');
  }
};

assertTestDatabase(isTest, testDatabaseName);

const config = {
  app: {
    host: process.env.NODE_ENV !== 'production' ? 'localhost' : '0.0.0.0',
    port: process.env.PORT,
    debug: process.env.NODE_ENV === 'development' ? { request: ['error'] } : {},
  },
  database: {
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: isTest ? testDatabaseName : process.env.PGDATABASE,
  },
  auth: {
    jwtStrategy: 'forumapi',
    accessTokenKey: process.env.ACCESS_TOKEN_KEY,
    refreshTokenKey: process.env.REFRESH_TOKEN_KEY,
    accessTokenAge: process.env.ACCESS_TOKEN_AGE || '1h',
  },
};

export default config;