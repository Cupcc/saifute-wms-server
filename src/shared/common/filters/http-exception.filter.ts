import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
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

    response.status(status).json({
      success: false,
      code: status,
      message,
    });
  }
}
