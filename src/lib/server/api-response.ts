import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "CONFLICT"
  | "FORBIDDEN"
  | "INTERNAL_SERVER_ERROR"
  | "INVALID_JSON"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR";

type ErrorDetail = {
  message: string;
  path?: string;
};

export function jsonData<T>(data: T, requestId: string, status = 200) {
  return NextResponse.json(
    {
      data,
      meta: {
        requestId,
      },
    },
    { status },
  );
}

export function jsonError(
  status: number,
  code: ApiErrorCode,
  message: string,
  requestId: string,
  details?: ErrorDetail[],
) {
  return NextResponse.json(
    {
      error: {
        code,
        details,
        message,
      },
      meta: {
        requestId,
      },
    },
    { status },
  );
}
