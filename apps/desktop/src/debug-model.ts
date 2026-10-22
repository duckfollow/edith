export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_RECORDS = 5000;
export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };
export interface Header {
  name: string;
  value: string;
}
export interface HttpEntry {
  captureKind?: "http" | "tunnel" | "sdk" | "gateway";
  blockedReason?: string;
  gatewayId?: string;
  gatewayPort?: number;
  routeId?: string;
  routePath?: string;
  upstream?: string;
  requestEncoding?: string;
  requestTruncated?: boolean;
  responseTruncated?: boolean;
  error?: string;
  id: number;
  timestamp: string;
  method: string;
  url: string;
  status: number;
  duration: number;
  size: number;
  requestHeaders: Header[];
  responseHeaders: Header[];
  requestBody: string;
  responseBody: string;
  encoding: string;
  mimeType: string;
  timings: Record<string, number>;
}
export interface LogEntry {
  id: number;
  timestamp: string;
  level: string;
  source: string;
  message: string;
  raw: string;
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function string(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function headers(value: unknown): Header[] {
  return Array.isArray(value)
    ? value
        .filter(object)
        .map((h) => ({ name: string(h.name), value: string(h.value) }))
    : [];
}
export function parseHar(text: string): HttpEntry[] {
  const document: unknown = JSON.parse(text);
  if (
    !object(document) ||
    !object(document.log) ||
    !Array.isArray(document.log.entries)
  )
    throw new Error("Expected a HAR file with log.entries.");
  if (document.log.entries.length > MAX_RECORDS)
    throw new Error(
      `HAR files are limited to ${MAX_RECORDS} entries. Export a smaller capture.`,
    );
  return document.log.entries.map((entry: unknown, index: number) => {
    if (!object(entry) || !object(entry.request) || !object(entry.response))
      throw new Error(
        `HAR entry ${index + 1} is missing request or response data.`,
      );
    const request = entry.request,
      response = entry.response;
    if (!string(request.url))
      throw new Error(`HAR entry ${index + 1} has no request URL.`);
    const content = object(response.content) ? response.content : {};
    const post = object(request.postData) ? request.postData : {};
    const timings: Record<string, number> = {};
    if (object(entry.timings))
      for (const [key, value] of Object.entries(entry.timings))
        if (typeof value === "number" && Number.isFinite(value) && value >= 0)
          timings[key] = value;
    return {
      id: index + 1,
      timestamp: string(entry.startedDateTime),
      method: string(request.method, "GET"),
      url: string(request.url),
      status: number(response.status),
      duration: Math.max(0, number(entry.time)),
      size: Math.max(0, number(content.size)),
      requestHeaders: headers(request.headers),
      responseHeaders: headers(response.headers),
      requestBody: string(post.text),
      responseBody: string(content.text),
      encoding: string(content.encoding),
      mimeType: string(content.mimeType),
      timings,
    };
  });
}
export function matchesHttp(
  entry: HttpEntry,
  query: string,
  status: string,
  method: string,
) {
  const group =
    entry.status === 0 ? "failed" : `${Math.floor(entry.status / 100)}xx`;
  return (
    (status === "all" || status === group) &&
    (method === "all" || method === entry.method) &&
    `${entry.method} ${entry.url} ${entry.status} ${entry.mimeType}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  );
}
export function parseLogs(text: string): LogEntry[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length > MAX_RECORDS)
    throw new Error(`Log files are limited to ${MAX_RECORDS} nonempty lines.`);
  return lines.map((raw, index) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    let level = "",
      timestamp = "",
      source = "file",
      message = raw;
    if (object(parsed)) {
      const rawLevel = parsed.level ?? parsed.severity;
      const pino: Record<number, string> = {
        10: "TRACE",
        20: "DEBUG",
        30: "INFO",
        40: "WARN",
        50: "ERROR",
        60: "FATAL",
      };
      level =
        typeof rawLevel === "number"
          ? pino[rawLevel] || "UNKNOWN"
          : string(rawLevel).toUpperCase();
      const time = parsed.timestamp ?? parsed.time;
      if (typeof time === "number" && Number.isFinite(time)) {
        const date = new Date(time);
        if (!Number.isNaN(date.valueOf())) timestamp = date.toISOString();
      } else timestamp = string(time);
      source = string(parsed.source, string(parsed.name, "file"));
      message = string(parsed.message, string(parsed.msg, raw));
    } else {
      level =
        raw
          .match(/\b(TRACE|DEBUG|INFO|WARN(?:ING)?|ERROR|FATAL)\b/i)?.[1]
          ?.toUpperCase() || "INFO";
      timestamp = raw.match(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z?/)?.[0] || "";
    }
    if (level === "WARNING") level = "WARN";
    return {
      id: index + 1,
      timestamp,
      level: level || "INFO",
      source,
      message,
      raw,
    };
  });
}
export function parseStorage(text: string): Record<string, Json> {
  const value: unknown = JSON.parse(text);
  if (!object(value))
    throw new Error(
      "Storage snapshot must be a JSON object of keys and values.",
    );
  if (Object.keys(value).length > MAX_RECORDS)
    throw new Error(`Storage snapshots are limited to ${MAX_RECORDS} keys.`);
  return value as Record<string, Json>;
}
export function updateStorage(
  storage: Record<string, Json>,
  key: string,
  text: string,
) {
  if (!Object.prototype.hasOwnProperty.call(storage, key))
    throw new Error("Select an existing key.");
  const value: Json = JSON.parse(text);
  // Own data properties prevent special keys such as __proto__ from changing prototypes.
  return Object.fromEntries(
    Object.entries(storage).map(([name, previous]) => [
      name,
      name === key ? value : previous,
    ]),
  ) as Record<string, Json>;
}
const secretHeader =
  /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-auth-token)$/i;
export function displayHeaders(values: Header[], reveal: boolean) {
  return values.map((h) => ({
    ...h,
    value: !reveal && secretHeader.test(h.name) ? "•••••• (hidden)" : h.value,
  }));
}
export function maskedUrl(value: string, reveal: boolean): string {
  if (reveal) return value;
  try {
    const url = new URL(value);
    url.username = url.username ? "hidden" : "";
    url.password = url.password ? "hidden" : "";
    for (const key of [...url.searchParams.keys()])
      if (/token|secret|password|api[-_]?key|authorization|code/i.test(key))
        url.searchParams.set(key, "[hidden]");
    return url.toString();
  } catch {
    return value;
  }
}
export function demoHar() {
  return JSON.stringify({
    log: {
      version: "1.2",
      creator: { name: "EDITH demo", version: "1" },
      entries: [
        [
          "GET",
          "https://api.example.test/v1/products",
          200,
          128,
          { products: [{ id: 1, name: "Everyday backpack", price: 79 }] },
          "",
        ],
        [
          "GET",
          "https://api.example.test/v1/profile",
          200,
          64,
          { id: "usr_demo", name: "Alex" },
          "",
        ],
        [
          "POST",
          "https://api.example.test/v1/checkout",
          504,
          5031,
          { error: "Gateway timeout", requestId: "req_demo" },
          JSON.stringify({ productId: 1, quantity: 2 }),
        ],
        [
          "GET",
          "https://cdn.example.test/images/backpack.webp",
          200,
          43,
          "[Binary content omitted]",
          "",
        ],
        [
          "POST",
          "https://api.example.test/v1/events",
          202,
          29,
          { accepted: true },
          JSON.stringify({ event: "checkout_attempt" }),
        ],
      ].map(([method, url, status, time, body, post], i) => ({
        startedDateTime: `2026-10-19T14:32:0${i}.000Z`,
        time,
        request: {
          method,
          url,
          headers: [
            { name: "Accept", value: "application/json" },
            { name: "Authorization", value: "Bearer DEMO_ONLY" },
          ],
          postData: { text: post },
        },
        response: {
          status,
          headers: [
            { name: "content-type", value: "application/json" },
            { name: "x-request-id", value: "req_demo" },
          ],
          content: {
            size: 512 + i * 213,
            mimeType: "application/json",
            text:
              typeof body === "string" ? body : JSON.stringify(body, null, 2),
          },
        },
        timings: {
          blocked: 0,
          dns: 4,
          connect: 12,
          send: 1,
          wait: Number(time) - 22,
          receive: 5,
        },
      })),
    },
  });
}
export const demoLogs = [
  {
    time: "2026-10-19T14:32:00.000Z",
    level: "info",
    source: "api",
    message: "Server listening on localhost:8080",
  },
  {
    time: "2026-10-19T14:32:01.000Z",
    level: "debug",
    source: "api",
    message: "GET /v1/products · 200 · 128ms",
  },
  {
    time: "2026-10-19T14:32:02.000Z",
    level: "info",
    source: "worker",
    message: "Payment queued · request_id=req_demo",
  },
  {
    time: "2026-10-19T14:32:03.000Z",
    level: "warn",
    source: "worker",
    message: "Gateway response delayed · attempt=1",
  },
  {
    time: "2026-10-19T14:32:04.000Z",
    level: "error",
    source: "worker",
    message: "Payment gateway timeout · request_id=req_demo",
  },
  {
    time: "2026-10-19T14:32:05.000Z",
    level: "info",
    source: "api",
    message: "POST /v1/checkout · 504 · request_id=req_demo",
  },
]
  .map((row) => JSON.stringify(row))
  .join("\n");
