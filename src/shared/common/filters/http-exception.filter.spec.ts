import type { ArgumentsHost } from "@nestjs/common";
import {
  BadRequestException,
  InternalServerErrorException,
  type LoggerService,
} from "@nestjs/common";
import { HttpExceptionFilter } from "./http-exception.filter";

function createHost() {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const request = {
    method: "POST",
    originalUrl: "/api/inbound/into-orders",
    url: "/api/inbound/into-orders",
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  return { host, response };
}

function createLogger() {
  return {
    error: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
  } as unknown as LoggerService & { error: jest.Mock };
}

describe("HttpExceptionFilter", () => {
  it("logs stack and safe request context for unexpected 500 errors", () => {
    const logger = createLogger();
    const filter = new HttpExceptionFilter(logger);
    const { host, response } = createHost();
    const error = new Error("database unique constraint failed");

    filter.catch(error, host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      code: 500,
      message: "服务器内部错误",
    });
    expect(logger.error).toHaveBeenCalledTimes(1);
    const [logMessage, stack] = logger.error.mock.calls[0] ?? [];
    expect(JSON.parse(String(logMessage))).toEqual({
      event: "UnhandledHttpException",
      method: "POST",
      path: "/api/inbound/into-orders",
      statusCode: 500,
      errorName: "Error",
      errorMessage: "database unique constraint failed",
      responseMessage: "服务器内部错误",
    });
    expect(String(stack)).toContain("database unique constraint failed");
  });

  it("logs explicit 500 HttpException messages without exposing them in request data", () => {
    const logger = createLogger();
    const filter = new HttpExceptionFilter(logger);
    const { host } = createHost();

    filter.catch(new InternalServerErrorException("upstream failed"), host);

    expect(logger.error).toHaveBeenCalledTimes(1);
    const [logMessage] = logger.error.mock.calls[0] ?? [];
    expect(JSON.parse(String(logMessage))).toMatchObject({
      statusCode: 500,
      errorName: "InternalServerErrorException",
      errorMessage: "upstream failed",
      responseMessage: "upstream failed",
    });
    expect(String(logMessage)).not.toContain("body");
    expect(String(logMessage)).not.toContain("authorization");
  });

  it("does not log expected 4xx exceptions as server errors", () => {
    const logger = createLogger();
    const filter = new HttpExceptionFilter(logger);
    const { host, response } = createHost();

    filter.catch(new BadRequestException("bad input"), host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      code: 400,
      message: "bad input",
    });
    expect(logger.error).not.toHaveBeenCalled();
  });
});
