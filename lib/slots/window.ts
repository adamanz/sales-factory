// Eastern Time business window. America/New_York is EDT (UTC-4) through
// November 1, 2026 and EST (UTC-5) after that.
export const EASTERN = "America/New_York";
export const BUSINESS_START_HOUR = 9;
export const BUSINESS_END_HOUR = 17;

export type Interval = {
  start: Date;
  end: Date;
};

type WallTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone = EASTERN,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let instant = utcGuess;
  for (let pass = 0; pass < 3; pass += 1) {
    const offset = timeZoneOffsetMs(new Date(instant), timeZone);
    instant = utcGuess - offset;
  }
  const result = new Date(instant);
  const wall = zonedParts(result, timeZone);
  if (wall.year !== year || wall.month !== month || wall.day !== day || wall.hour !== hour || wall.minute !== minute) {
    throw new Error(`Could not convert ${year}-${month}-${day} ${hour}:${minute} in ${timeZone}`);
  }
  return result;
}

export function businessHoursEt(isoDate: string): Interval {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new Error(`Invalid calendar date: ${isoDate}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const start = zonedWallTimeToUtc(year, month, day, BUSINESS_START_HOUR, 0, EASTERN);
  const end = zonedWallTimeToUtc(year, month, day, BUSINESS_END_HOUR, 0, EASTERN);
  if (end.getTime() <= start.getTime()) throw new Error(`Empty window for ${isoDate}`);
  return { start, end };
}

export function todayInTimeZone(timeZone: string, now = new Date()): string {
  const wall = zonedParts(now, timeZone);
  const month = String(wall.month).padStart(2, "0");
  const day = String(wall.day).padStart(2, "0");
  return `${wall.year}-${month}-${day}`;
}

function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - instant.getTime();
}

function zonedParts(instant: Date, timeZone: string): WallTime {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const bag: Record<string, string> = {};
  for (const part of fmt.formatToParts(instant)) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  let year = Number(bag.year);
  let month = Number(bag.month);
  let day = Number(bag.day);
  let hour = Number(bag.hour);
  if (hour === 24) {
    hour = 0;
    const rolled = new Date(Date.UTC(year, month - 1, day + 1));
    year = rolled.getUTCFullYear();
    month = rolled.getUTCMonth() + 1;
    day = rolled.getUTCDate();
  }
  return {
    year,
    month,
    day,
    hour,
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}
