import { stripLowValueDefaultMetaFields } from "./winston.config";

describe("stripLowValueDefaultMetaFields", () => {
  it("removes app and environment from HTTP request logs", () => {
    const info = stripLowValueDefaultMetaFields({
      context: "HTTP",
      app: "saifute-wms-server",
      environment: "development",
      method: "GET",
      path: "/api/example",
      statusCode: 200,
    });

    expect(info).toEqual({
      context: "HTTP",
      method: "GET",
      path: "/api/example",
      statusCode: 200,
    });
  });

  it("removes app and environment from bootstrap logs", () => {
    const info = stripLowValueDefaultMetaFields({
      context: "Bootstrap",
      app: "saifute-wms-server",
      environment: "development",
      message: "Application started",
    });

    expect(info).toEqual({
      context: "Bootstrap",
      message: "Application started",
    });
  });

  it("keeps app and environment for other application logs", () => {
    const info = stripLowValueDefaultMetaFields({
      context: "SchedulerService",
      app: "saifute-wms-server",
      environment: "development",
      message: "Application started",
    });

    expect(info).toEqual({
      context: "SchedulerService",
      app: "saifute-wms-server",
      environment: "development",
      message: "Application started",
    });
  });
});
