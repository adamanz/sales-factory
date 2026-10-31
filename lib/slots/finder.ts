// Read-only free/busy. There is no create, patch, or delete path.
import { redactSecrets } from "../secrets";
import { assertCalendarRequestAllowed, CALENDAR_FREEBUSY_URL } from "./allowlist";
import type { Interval } from "./window";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function subtractBusy(window: Interval, busy: Interval[]): Interval[] {
  if (window.end.getTime() <= window.start.getTime()) throw new Error("Window end must be after start");
  const clipped = busy
    .map((interval) => ({
      start: new Date(Math.max(interval.start.getTime(), window.start.getTime())),
      end: new Date(Math.min(interval.end.getTime(), window.end.getTime())),
    }))
    .filter((interval) => interval.end.getTime() > interval.start.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const merged: Interval[] = [];
  for (const interval of clipped) {
    const last = merged[merged.length - 1];
    if (!last || interval.start.getTime() > last.end.getTime()) {
      merged.push({ start: interval.start, end: interval.end });
    } else if (interval.end.getTime() > last.end.getTime()) {
      last.end = interval.end;
    }
  }

  const free: Interval[] = [];
  let cursor = window.start.getTime();
  const end = window.end.getTime();
  for (const interval of merged) {
    if (interval.start.getTime() > cursor) {
      free.push({ start: new Date(cursor), end: new Date(interval.start.getTime()) });
    }
    cursor = Math.max(cursor, interval.end.getTime());
  }
  if (cursor < end) free.push({ start: new Date(cursor), end: new Date(end) });
  return free;
}

export async function queryFreeBusy(opts: {
  accessToken: string;
  window: Interval;
  calendarId?: string;
  fetchImpl?: FetchLike;
}): Promise<Interval[]> {
  const method = "POST";
  assertCalendarRequestAllowed(method, CALENDAR_FREEBUSY_URL);
  const calendarId = opts.calendarId ?? "primary";
  const fetchImpl = opts.fetchImpl ?? defaultFetch;
  const response = await fetchImpl(CALENDAR_FREEBUSY_URL, {
    method,
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: opts.window.start.toISOString(),
      timeMax: opts.window.end.toISOString(),
      items: [{ id: calendarId }],
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Free/busy request failed (${response.status}): ${redactSecrets(text, [opts.accessToken])}`);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("Free/busy response was not JSON");
  }
  return parseBusy(payload, calendarId);
}

export async function findFreeSlots(opts: {
  accessToken: string;
  window: Interval;
  calendarId?: string;
  fetchImpl?: FetchLike;
}): Promise<Interval[]> {
  const busy = await queryFreeBusy(opts);
  return subtractBusy(opts.window, busy);
}

export function readOnlySlotFinder(deps: { accessToken: string; fetchImpl?: FetchLike }) {
  return {
    freeSlots(window: Interval, calendarId?: string): Promise<Interval[]> {
      return findFreeSlots({
        accessToken: deps.accessToken,
        window,
        calendarId,
        fetchImpl: deps.fetchImpl,
      });
    },
  };
}

const defaultFetch: FetchLike = (input, init) => fetch(input, init);

function parseBusy(payload: unknown, calendarId: string): Interval[] {
  if (!isRecord(payload) || !isRecord(payload.calendars)) {
    throw new Error("Free/busy response was missing calendars");
  }
  const calendar = payload.calendars[calendarId];
  if (!isRecord(calendar)) throw new Error(`Free/busy response had no calendar ${calendarId}`);
  if (Array.isArray(calendar.errors) && calendar.errors.length > 0) {
    const reasons: string[] = [];
    for (const error of calendar.errors) {
      if (isRecord(error) && typeof error.reason === "string") reasons.push(error.reason);
    }
    throw new Error(`Free/busy failed: ${reasons.join(", ") || "unknown calendar error"}`);
  }
  if (!Array.isArray(calendar.busy)) return [];
  const intervals: Interval[] = [];
  for (const item of calendar.busy) {
    if (!isRecord(item) || typeof item.start !== "string" || typeof item.end !== "string") continue;
    const start = new Date(item.start);
    const end = new Date(item.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    intervals.push({ start, end });
  }
  return intervals;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
