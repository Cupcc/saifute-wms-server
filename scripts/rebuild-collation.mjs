import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as mariadb from "mariadb";

const DEFAULT_COLLATION = "utf8mb4_0900_ai_ci";
const DEFAULT_CHARACTER_SET = "utf8mb4";

function quoteIdentifier(value) {
  return `\`${value.replaceAll("`", "``")}\``;
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const parsedUrl = new URL(databaseUrl);

if (parsedUrl.protocol !== "mysql:") {
  throw new Error(
    `Expected a mysql DATABASE_URL, received ${parsedUrl.protocol}`,
  );
}

const database = parsedUrl.pathname.replace(/^\//, "");

if (!database) {
  throw new Error("DATABASE_URL must include a database name.");
}

const requestedCollation = process.argv[2] ?? DEFAULT_COLLATION;

if (!requestedCollation.startsWith(`${DEFAULT_CHARACTER_SET}_`)) {
  throw new Error(
    `Expected a ${DEFAULT_CHARACTER_SET} collation, received ${requestedCollation}.`,
  );
}

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function buildSchemaSql() {
  const diffArgs = [
    "exec",
    "prisma",
    "migrate",
    "diff",
    "--from-empty",
    "--to-schema",
    "prisma/schema.prisma",
    "--script",
  ];
  const diffOutput =
    process.platform === "win32"
      ? execFileSync(
          "cmd.exe",
          ["/d", "/s", "/c", `pnpm ${diffArgs.join(" ")}`],
          {
            cwd: rootDir,
            encoding: "utf8",
            maxBuffer: 20 * 1024 * 1024,
          },
        )
      : execFileSync("pnpm", diffArgs, {
          cwd: rootDir,
          encoding: "utf8",
          maxBuffer: 20 * 1024 * 1024,
        });

  const sqlStart = diffOutput.indexOf("-- CreateTable");

  if (sqlStart === -1) {
    throw new Error(
      "Failed to extract SQL from `prisma migrate diff`. Expected SQL output was not found.",
    );
  }

  return diffOutput.slice(sqlStart).trim();
}

const migrationSql = buildSchemaSql();

const connectionConfig = {
  host: parsedUrl.hostname || "127.0.0.1",
  port: Number(parsedUrl.port || 3306),
  user: decodeURIComponent(parsedUrl.username),
  password: decodeURIComponent(parsedUrl.password),
  multipleStatements: true,
};

let adminConnection;
let databaseConnection;

try {
  adminConnection = await mariadb.createConnection(connectionConfig);

  const supportedCollations = await adminConnection.query(
    "SHOW COLLATION LIKE ?",
    [requestedCollation],
  );

  if (supportedCollations.length === 0) {
    throw new Error(
      `Collation ${requestedCollation} is not supported by the current MySQL server.`,
    );
  }

  await adminConnection.query(
    `DROP DATABASE IF EXISTS ${quoteIdentifier(database)};`,
  );
  await adminConnection.query(
    `CREATE DATABASE ${quoteIdentifier(database)} CHARACTER SET ${DEFAULT_CHARACTER_SET} COLLATE ${requestedCollation};`,
  );

  databaseConnection = await mariadb.createConnection({
    ...connectionConfig,
    database,
  });
  await databaseConnection.query(migrationSql);

  if (requestedCollation !== "utf8mb4_unicode_ci") {
    await databaseConnection.query(
      `ALTER DATABASE ${quoteIdentifier(database)} CHARACTER SET ${DEFAULT_CHARACTER_SET} COLLATE ${requestedCollation};`,
    );

    const baseTables = await databaseConnection.query(
      `
        SELECT table_name AS tableName
        FROM information_schema.tables
        WHERE table_schema = ?
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `,
      [database],
    );

    for (const { tableName } of baseTables) {
      await databaseConnection.query(
        `ALTER TABLE ${quoteIdentifier(tableName)} CONVERT TO CHARACTER SET ${DEFAULT_CHARACTER_SET} COLLATE ${requestedCollation};`,
      );
    }
  }

  console.log(
    `Database ${database} rebuilt with ${requestedCollation} using the core Prisma migration.`,
  );
} finally {
  await databaseConnection?.end();
  await adminConnection?.end();
}
