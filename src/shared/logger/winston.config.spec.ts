import * as os from "node:os";
import * as path from "node:path";
import type { AppConfigService } from "../config/app-config.service";
import { createWinstonModuleOptions } from "./winston.config";

jest.mock("winston-daily-rotate-file", () =>
  jest.fn().mockImplementation(() => ({
    on: jest.fn(),
  })),
);

describe("createWinstonModuleOptions", () => {
  it("does not add app and environment to every log entry", () => {
    const options = createWinstonModuleOptions({
      appName: "saifute-wms-server",
      environment: "development",
      logDirPath: path.join(os.tmpdir(), "saifute-wms-logger-test"),
      logLevel: "info",
    } as AppConfigService);

    expect(options).not.toHaveProperty("defaultMeta");
  });
});
