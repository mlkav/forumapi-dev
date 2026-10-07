import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

const databaseName = process.env.PGDATABASE_TEST || 'forumapi_test';

if (!/_test$/i.test(databaseName)) {
  throw new Error(
    'Database setup is restricted to databases ending in "_test"',
  );
}

const connectionConfig = {
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  password: process.env.PGPASSWORD,
  port: Number(process.env.PGPORT),
};

async function createDatabase() {
  const client = new Client({
    ...connectionConfig,
    database: 'postgres',
  });

  try {
    await client.connect();

    console.log(
      `Connected to PostgreSQL: ${process.env.PGHOST}:${process.env.PGPORT}`,
    );

    const { rows } = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [databaseName],
    );

    if (rows.length > 0) {
      console.log(`Database already exists: ${databaseName}`);
      return;
    }

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(databaseName)) {
      throw new Error(`Invalid database name: ${databaseName}`);
    }

    await client.query(`CREATE DATABASE "${databaseName}"`);

    console.log(`Database created successfully: ${databaseName}`);
  } finally {
    await client.end();
  }
}

async function dropAllTables() {
  const client = new Client({
    ...connectionConfig,
    database: databaseName,
  });

  try {
    await client.connect();

    console.log(`Connected to database: ${databaseName}`);

    const { rows } = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public';
    `);

    if (rows.length === 0) {
      console.log('No tables found.');
      return;
    }

    for (const { tablename } of rows) {
      await client.query(`DROP TABLE IF EXISTS "${tablename}" CASCADE`);

      console.log(`Dropped table: ${tablename}`);
    }

    console.log('All tables dropped successfully.');
  } finally {
    await client.end();
  }
}

async function setupDatabase() {
  try {
    await createDatabase();
    await dropAllTables();

    console.log(`Database setup completed: ${databaseName}`);
  } catch (error) {
    console.error('Database setup failed:', error.message);
    process.exitCode = 1;
  }
}

setupDatabase();
