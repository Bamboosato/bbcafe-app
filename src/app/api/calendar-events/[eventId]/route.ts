import {
  CalendarEventValidationError,
  deleteCalendarEvent,
  updateCalendarEvent,
} from "@/features/messages/server/calendarEvents";
import { jsonData, jsonError } from "@/lib/server/api-response";
import { requireViewerSession } from "@/lib/server/auth";
import { createRequestId, readJsonBody } from "@/lib/server/request";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    eventId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requestId = createRequestId();
  const auth = requireViewerSession(request, requestId);

  if ("response" in auth) {
    return auth.response;
  }

  const { eventId } = await context.params;

  try {
    const body = await readJsonBody(request);
    const event = await updateCalendarEvent(
      auth.payload.lineAccountId,
      eventId,
      typeof body === "object" && body !== null ? body : {},
    );

    if (!event) {
      return jsonError(404, "NOT_FOUND", "カレンダー情報が見つかりません。", requestId);
    }

    return jsonData({ event }, requestId);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_JSON") {
      return jsonError(400, "INVALID_JSON", "JSONとして解析できません。", requestId);
    }

    if (error instanceof CalendarEventValidationError) {
      return jsonError(400, "VALIDATION_ERROR", error.message, requestId);
    }

    console.error("[calendar-events-update] failed", {
      eventId,
      lineAccountId: auth.payload.lineAccountId,
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "カレンダー情報を更新できません。", requestId);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requestId = createRequestId();
  const auth = requireViewerSession(request, requestId);

  if ("response" in auth) {
    return auth.response;
  }

  const { eventId } = await context.params;

  try {
    const deleted = await deleteCalendarEvent(auth.payload.lineAccountId, eventId);

    if (!deleted) {
      return jsonError(404, "NOT_FOUND", "カレンダー情報が見つかりません。", requestId);
    }

    return jsonData({ deleted: true }, requestId);
  } catch (error) {
    console.error("[calendar-events-delete] failed", {
      eventId,
      lineAccountId: auth.payload.lineAccountId,
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "カレンダー情報を削除できません。", requestId);
  }
}
