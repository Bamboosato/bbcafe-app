import {
  CalendarEventValidationError,
  createCalendarEvent,
  filterCalendarEventsForDate,
  listCalendarEvents,
} from "@/features/messages/server/calendarEvents";
import { jsonData, jsonError } from "@/lib/server/api-response";
import { requireViewerSession } from "@/lib/server/auth";
import { createRequestId, readJsonBody } from "@/lib/server/request";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = createRequestId();
  const auth = requireViewerSession(request, requestId);

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const events = await listCalendarEvents(auth.payload.lineAccountId);

    return jsonData({ events, todayEvents: filterCalendarEventsForDate(events) }, requestId);
  } catch (error) {
    console.error("[calendar-events-list] failed", {
      lineAccountId: auth.payload.lineAccountId,
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "カレンダー情報を取得できません。", requestId);
  }
}

export async function POST(request: Request) {
  const requestId = createRequestId();
  const auth = requireViewerSession(request, requestId);

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const body = await readJsonBody(request);
    const event = await createCalendarEvent(
      auth.payload.lineAccountId,
      typeof body === "object" && body !== null ? body : {},
    );

    return jsonData({ event }, requestId, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_JSON") {
      return jsonError(400, "INVALID_JSON", "JSONとして解析できません。", requestId);
    }

    if (error instanceof CalendarEventValidationError) {
      return jsonError(400, "VALIDATION_ERROR", error.message, requestId);
    }

    console.error("[calendar-events-create] failed", {
      lineAccountId: auth.payload.lineAccountId,
      message: error instanceof Error ? error.message : String(error),
      requestId,
    });

    return jsonError(503, "SERVICE_UNAVAILABLE", "カレンダー情報を保存できません。", requestId);
  }
}
