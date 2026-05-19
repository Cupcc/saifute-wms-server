import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  type LoggerService,
} from "@nestjs/common";
import type { Request, Response } from "express";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly logger: LoggerService = new Logger(
      HttpExceptionFilter.name,
    ),
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const payload =
      exception instanceof HttpException
        ? exception.getResponse()
        : "服务器内部错误";

    const message = Array.isArray((payload as { message?: unknown }).message)
      ? (payload as { message: string[] }).message.join(", ")
      : typeof payload === "string"
        ? payload
        : ((payload as { message?: string }).message ?? "请求失败");

    this.logServerError(exception, request, status, message);

    response.status(status).json({
      success: false,
      code: status,
      message,
    });
  }

  private logServerError(
    exception: unknown,
    request: Request,
    status: number,
    responseMessage: string,
  ): void {
    if (status < HttpStatus.INTERNAL_SERVER_ERROR) {
      return;
    }

    const errorMessage =
      exception instanceof Error ? exception.message : String(exception);
    const errorName =
      exception instanceof Error ? exception.name : typeof exception;
    const stack = exception instanceof Error ? exception.stack : undefined;
    const path = request.originalUrl || request.url;

    this.logger.error(
      JSON.stringify({
        event: "UnhandledHttpException",
        method: request.method,
        path,
        statusCode: status,
        errorName,
        errorMessage,
        responseMessage,
      }),
      stack,
    );
  }
}
