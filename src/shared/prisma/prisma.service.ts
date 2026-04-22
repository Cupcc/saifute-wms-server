import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { Prisma, PrismaClient } from "../../../generated/prisma/client";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

export function extractPrismaDriverAdapterMessage(
  error: unknown,
): string | null {
  const errorRecord = asRecord(error);
  const meta = asRecord(errorRecord?.meta);
  const driverAdapterError = asRecord(meta?.driverAdapterError);
  const driverCause = asRecord(driverAdapterError?.cause);

  const nestedCause = driverCause?.cause;
  if (typeof nestedCause === "string" && nestedCause.length > 0) {
    return nestedCause;
  }

  const originalMessage = driverCause?.originalMessage;
  if (typeof originalMessage === "string" && originalMessage.length > 0) {
    return originalMessage;
  }

  const driverMessage = driverCause?.message;
  if (typeof driverMessage === "string" && driverMessage.length > 0) {
    return driverMessage;
  }

  const adapterMessage = driverAdapterError?.message;
  if (typeof adapterMessage === "string" && adapterMessage.length > 0) {
    return adapterMessage;
  }

  return null;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is required. For e2e tests without a database, override PrismaService with PrismaE2eStub.",
      );
    }
    const adapter = new PrismaMariaDb(url);
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    try {
      await this.$queryRaw`SELECT 1`;
    } catch (error) {
      const driverMessage = extractPrismaDriverAdapterMessage(error);
      const message = driverMessage
        ? `Database connectivity check failed: ${driverMessage}`
        : `Database connectivity check failed: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(message);
      throw new Error(message, {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async runInTransaction<T>(
    handler: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(handler);
  }
}
