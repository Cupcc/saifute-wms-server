import { extractPrismaDriverAdapterMessage } from "./prisma.service";

describe("extractPrismaDriverAdapterMessage", () => {
  it("returns the deepest driver cause when present", () => {
    const message = extractPrismaDriverAdapterMessage({
      meta: {
        driverAdapterError: {
          cause: {
            cause:
              "(conn:-1, no: 1129, SQLState: HY000) Host '192.168.6.172' is blocked because of many connection errors",
            message:
              "pool timeout: failed to retrieve a connection from pool after 10018ms",
          },
        },
      },
    });

    expect(message).toContain("Host '192.168.6.172' is blocked");
  });

  it("falls back to the adapter message when nested causes are absent", () => {
    const message = extractPrismaDriverAdapterMessage({
      meta: {
        driverAdapterError: {
          message: "pool timeout: failed to retrieve a connection from pool",
        },
      },
    });

    expect(message).toBe(
      "pool timeout: failed to retrieve a connection from pool",
    );
  });

  it("returns null when the Prisma error does not expose adapter metadata", () => {
    expect(extractPrismaDriverAdapterMessage(new Error("boom"))).toBeNull();
  });
});
