import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import type { Logger } from "winston";
import { HttpLoggingMiddleware } from "./http-logging.middleware";

describe("HttpLoggingMiddleware", () => {
  function createResponse(statusCode: number, contentLength = "62") {
    const response = new EventEmitter() as Response & EventEmitter;
    response.statusCode = statusCode;
    response.getHeader = jest.fn().mockReturnValue(contentLength);
    return response;
  }

  function createRequest(path: string) {
    return {
      method: "GET",
      originalUrl: path,
      url: path,
      ip: "::1",
      socket: {
        remoteAddress: "::1",
      },
      headers: {
        "user-agent": "jest-agent",
      },
    } as Request;
  }

  it.each([
    { statusCode: 200, expectedLevel: "info" },
    { statusCode: 404, expectedLevel: "warn" },
    { statusCode: 500, expectedLevel: "error" },
  ])("logs HTTP %s responses with %s level", ({
    statusCode,
    expectedLevel,
  }) => {
    const logger = {
      log: jest.fn(),
    } as unknown as Logger;
    const middleware = new HttpLoggingMiddleware(logger);
    const request = createRequest(`/test-${statusCode}`);
    const response = createResponse(statusCode);
    const next = jest.fn();

    middleware.use(request, response, next);
    response.emit("finish");

    expect(next).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith(
      expectedLevel,
      expect.stringMatching(
        new RegExp(`^GET /test-${statusCode} ${statusCode} \\d+ms$`),
      ),
      expect.objectContaining({
        context: "HTTP",
        method: "GET",
        path: `/test-${statusCode}`,
        ip: "127.0.0.1",
        contentLength: "62",
      }),
    );
  });
});
