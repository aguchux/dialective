import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponseBody {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  timestamp: string;
  [extra: string]: unknown;
}

/**
 * Normalizes every error response (validation, not-found, internal) to the
 * same {statusCode, message, error, path, timestamp} shape so frontend
 * clients can handle errors generically instead of per-endpoint.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[];
    let error: string;
    let extra: Record<string, unknown> | undefined;

    if (isHttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        error = exception.name;
      } else {
        const bodyObj = body as {
          message?: string | string[];
          error?: string;
          statusCode?: unknown;
          [k: string]: unknown;
        };
        message = bodyObj.message ?? exception.message;
        error = bodyObj.error ?? exception.name;
        // Custom exceptions (e.g. AuthMaintenanceException) attach fields
        // like authMaintenanceUntil beyond the standard shape -- forward
        // those through so the frontend doesn't need a second round-trip
        // to render a countdown/detail, while still normalizing the
        // required statusCode/message/error/path/timestamp keys above them.
        const { message: _m, error: _e, statusCode: _s, ...rest } = bodyObj;
        if (Object.keys(rest).length > 0) extra = rest;
      }
    } else {
      message = 'Internal server error';
      error = 'InternalServerError';
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorResponseBody = {
      statusCode,
      message,
      error,
      path: request.url,
      timestamp: new Date().toISOString(),
      ...extra,
    };

    response.status(statusCode).json(body);
  }
}
