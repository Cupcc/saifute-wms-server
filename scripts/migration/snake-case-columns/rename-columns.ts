import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createConnection } from "mariadb";

type ColumnMapping = {
  table: string;
  oldColumn: string;
  newColumn: string;
};

type ColumnRow = {
  TABLE_NAME?: string;
  COLUMN_NAME?: string;
  table_name?: string;
  column_name?: string;
};

const SCALAR_TYPES = new Set([
  "String",
  "Boolean",
  "Int",
  "BigInt",
  "Float",
  "Decimal",
  "DateTime",
  "Json",
  "Bytes",
]);

function parseArgs(argv = process.argv.slice(2)): { execute: boolean } {
  return {
    execute: argv.includes("--execute"),
  };
}

function quoteIdentifier(identifier: string): string {
  return `\`${identifier.replaceAll("`", "``")}\``;
}

function baseType(type: string): string {
  return type.replaceAll("?", "").replaceAll("[", "").replaceAll("]", "");
}

function readMappedColumns(schemaPath: string): ColumnMapping[] {
  const schema = readFileSync(schemaPath, "utf8");
  const enumNames = new Set(
    [...schema.matchAll(/^enum\s+(\w+)\s*\{/gm)].map((match) => match[1]),
  );
  const modelNames = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map(
    (match) => match[1],
  );
  const mappings: ColumnMapping[] = [];

  for (const modelName of modelNames) {
    const block = schema.match(
      new RegExp(`model\\s+${modelName}\\s+\\{([\\s\\S]*?)\\n\\}`, "m"),
    )?.[1];
    if (!block) {
      continue;
    }

    const table = block.match(/@@map\("([^"]+)"\)/)?.[1] ?? modelName;

    for (const line of block.split("\n")) {
      const field = line.match(/^\s{2}(\w+)\s+([^\s]+)(.*)$/);
      if (!field) {
        continue;
      }

      const [, fieldName, type, attrs] = field;
      const fieldBaseType = baseType(type);
      if (!SCALAR_TYPES.has(fieldBaseType) && !enumNames.has(fieldBaseType)) {
        continue;
      }

      const mappedColumn = attrs.match(/@map\("([^"]+)"\)/)?.[1];
      if (!mappedColumn || mappedColumn === fieldName) {
        continue;
      }

      mappings.push({
        table,
        oldColumn: fieldName,
        newColumn: mappedColumn,
      });
    }
  }

  return mappings;
}

function groupColumns(rows: ColumnRow[]): Map<string, Set<string>> {
  const columnsByTable = new Map<string, Set<string>>();

  for (const row of rows) {
    const table = row.TABLE_NAME ?? row.table_name;
    const column = row.COLUMN_NAME ?? row.column_name;
    if (!table || !column) {
      continue;
    }

    if (!columnsByTable.has(table)) {
      columnsByTable.set(table, new Set());
    }
    columnsByTable.get(table)?.add(column);
  }

  return columnsByTable;
}

async function main(): Promise<void> {
  const { execute } = parseArgs();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const schemaPath = join(process.cwd(), "prisma/schema.prisma");
  const mappings = readMappedColumns(schemaPath);
  const url = new URL(databaseUrl);
  const database = url.pathname.replace(/^\/+/, "");
  const connection = await createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
  });

  try {
    const rows = await connection.query<ColumnRow[]>(
      `
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = ?
      `,
      [database],
    );
    const columnsByTable = groupColumns(rows);
    const pending: ColumnMapping[] = [];
    const alreadyRenamed: ColumnMapping[] = [];
    const conflicts: ColumnMapping[] = [];
    const missing: ColumnMapping[] = [];

    for (const mapping of mappings) {
      const columns = columnsByTable.get(mapping.table) ?? new Set<string>();
      const hasOldColumn = columns.has(mapping.oldColumn);
      const hasNewColumn = columns.has(mapping.newColumn);

      if (hasOldColumn && !hasNewColumn) {
        pending.push(mapping);
        continue;
      }

      if (!hasOldColumn && hasNewColumn) {
        alreadyRenamed.push(mapping);
        continue;
      }

      if (hasOldColumn && hasNewColumn) {
        conflicts.push(mapping);
        continue;
      }

      missing.push(mapping);
    }

    console.log(
      JSON.stringify(
        {
          database,
          mappedColumns: mappings.length,
          pendingRenames: pending.length,
          alreadyRenamed: alreadyRenamed.length,
          conflicts: conflicts.length,
          missing: missing.length,
          execute,
        },
        null,
        2,
      ),
    );

    if (conflicts.length > 0 || missing.length > 0) {
      console.error(
        JSON.stringify(
          {
            conflicts: conflicts.slice(0, 20),
            missing: missing.slice(0, 20),
          },
          null,
          2,
        ),
      );
      throw new Error("Column mapping preflight failed.");
    }

    if (!execute) {
      console.log("Dry run only. Re-run with --execute to rename columns.");
      return;
    }

    for (const [index, mapping] of pending.entries()) {
      await connection.query(
        `ALTER TABLE ${quoteIdentifier(mapping.table)} RENAME COLUMN ${quoteIdentifier(mapping.oldColumn)} TO ${quoteIdentifier(mapping.newColumn)}`,
      );

      const completed = index + 1;
      if (completed % 50 === 0 || completed === pending.length) {
        console.log(`Renamed ${completed}/${pending.length}`);
      }
    }
  } finally {
    await connection.end();
  }
}

await main();
