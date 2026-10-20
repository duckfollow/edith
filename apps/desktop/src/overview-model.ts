import type { HttpEntry, LogEntry } from "./debug-model";
export type OverviewWindow = "all" | "60s" | "5m";
export interface Bucket {
  start: number;
  end: number;
  count: number;
  average: number | null;
}
export function summarize(
  requests: HttpEntry[],
  logs: LogEntry[],
  window: OverviewWindow = "all",
) {
  const timestamps = [...requests, ...logs]
    .map((e) => Date.parse(e.timestamp))
    .filter(Number.isFinite);
  const latest = timestamps.length ? Math.max(...timestamps) : null;
  const cutoff =
    latest === null || window === "all"
      ? -Infinity
      : latest - (window === "60s" ? 60000 : 300000);
  const inWindow = (entry: { timestamp: string }) =>
    window === "all" ||
    (Number.isFinite(Date.parse(entry.timestamp)) &&
      Date.parse(entry.timestamp) >= cutoff);
  const retained = requests.filter(inWindow),
    filteredLogs = logs.filter(inWindow);
  const tunnels = retained.filter(
    (r) => r.captureKind === "tunnel" || r.method.toUpperCase() === "CONNECT",
  );
  const http = retained.filter(
    (r) => r.captureKind !== "tunnel" && r.method.toUpperCase() !== "CONNECT",
  );
  const failure = http.filter((r) => r.status === 0 || r.status >= 400).length;
  const durations = http
    .map((r) => r.duration)
    .filter((v) => Number.isFinite(v) && v >= 0)
    .sort((a, b) => a - b);
  const p95 = durations.length
    ? durations[Math.ceil(durations.length * 0.95) - 1]
    : null;
  const average = durations.length
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : null;
  const statuses = new Map<string, number>();
  const methods = new Map<string, number>();
  for (const entry of http) {
    const status =
      entry.status === 0 ? "Failed" : `${Math.floor(entry.status / 100)}xx`;
    statuses.set(status, (statuses.get(status) || 0) + 1);
    methods.set(entry.method, (methods.get(entry.method) || 0) + 1);
  }
  const validHttp = http
    .map((entry) => ({ entry, time: Date.parse(entry.timestamp) }))
    .filter((item) => Number.isFinite(item.time));
  let buckets: Bucket[] = [];
  if (latest !== null) {
    let start =
      window === "all"
        ? timestamps.length
          ? Math.min(...timestamps)
          : latest
        : cutoff;
    const end = latest;
    if (start === end) start -= 1000;
    const step = (end - start) / 24;
    buckets = Array.from({ length: 24 }, (_, i) => ({
      start: start + i * step,
      end: start + (i + 1) * step,
      count: 0,
      average: null,
    }));
    const sums = Array(24).fill(0),
      counts = Array(24).fill(0);
    for (const { entry, time } of validHttp) {
      const i = Math.min(23, Math.max(0, Math.floor((time - start) / step)));
      buckets[i].count++;
      if (Number.isFinite(entry.duration) && entry.duration >= 0) {
        sums[i] += entry.duration;
        counts[i]++;
      }
    }
    buckets.forEach((bucket, i) => {
      bucket.average = counts[i] ? sums[i] / counts[i] : null;
    });
  }
  return {
    http: http.length,
    tunnels: tunnels.length,
    failure,
    failureRate: http.length ? (failure / http.length) * 100 : 0,
    average,
    p95,
    logEvents: filteredLogs.length,
    logErrors: filteredLogs.filter((l) =>
      ["ERROR", "FATAL"].includes(l.level.toUpperCase()),
    ).length,
    statuses: [...statuses].sort(([a], [b]) => a.localeCompare(b)),
    methods: [...methods].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    ),
    buckets,
    latest,
    undated: validHttp.length < http.length,
  };
}

export interface ActivityDay {
  key: string;
  timestamp: number;
  count: number;
  level: number;
  inRange: boolean;
}
function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
/** Local calendar days, not fixed UTC durations: DST must not shift grid rows. */
export function activityCalendar(requests: HttpEntry[], anchor = Date.now()) {
  const http = requests.filter(
    (r) => r.captureKind !== "tunnel" && r.method.toUpperCase() !== "CONNECT",
  );
  const dated = http
    .map((r) => Date.parse(r.timestamp))
    .filter(Number.isFinite);
  const end = new Date(dated.length ? Math.max(...dated) : anchor);
  end.setHours(12, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 364);
  const gridStart = new Date(start);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const counts = new Map<string, number>();
  for (const time of dated) {
    const key = dayKey(new Date(time));
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const max = Math.max(
    1,
    ...[...counts]
      .filter(([key]) => key >= dayKey(start) && key <= dayKey(end))
      .map(([, count]) => count),
  );
  const days: ActivityDay[] = [];
  let total = 0,
    activeDays = 0;
  for (let i = 0; i < 371; i++) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    const inRange = date >= start && date <= end;
    const count = inRange ? counts.get(dayKey(date)) || 0 : 0;
    if (inRange) {
      total += count;
      if (count) activeDays++;
    }
    days.push({
      key: dayKey(date),
      timestamp: date.valueOf(),
      count,
      level: count ? Math.max(1, Math.ceil((count / max) * 4)) : 0,
      inRange,
    });
  }
  // A year fits 53 week columns; padding outside the 365-day window is blank.
  return {
    days,
    total,
    activeDays,
    max,
    start: dayKey(start),
    end: dayKey(end),
    undated: http.length - dated.length,
  };
}
