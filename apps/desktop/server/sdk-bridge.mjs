import { randomBytes, timingSafeEqual } from "node:crypto";
const MAX_BYTES = 256 * 1024,
  MAX_EVENTS = 512,
  MAX_APPS = 16;
function json(res, status, value, origin) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(value));
}
function text(value, max = 12000) {
  return typeof value === "string" ? value.slice(0, max) : "";
}
function finite(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}
function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function headers(value) {
  return Array.isArray(value)
    ? value
        .slice(0, 100)
        .filter(object)
        .map((h) => ({ name: text(h.name, 256), value: text(h.value, 4096) }))
    : [];
}
export function createSdkBridge({
  controlOrigin = "http://127.0.0.1:1420",
} = {}) {
  const url = new URL(controlOrigin),
    hosts = new Set([
      url.host,
      `localhost:${url.port}`,
      `127.0.0.1:${url.port}`,
    ]);
  const controlToken = randomBytes(32).toString("hex");
  let pairingToken = "",
    enabled = false,
    sequence = 0,
    evicted = 0;
  let events = [];
  const apps = new Map();
  function equal(value, expected) {
    const a = Buffer.from(String(value || "")),
      b = Buffer.from(expected);
    return b.length > 0 && a.length === b.length && timingSafeEqual(a, b);
  }
  function state(after = Number.MAX_SAFE_INTEGER) {
    return {
      enabled,
      lastId: sequence,
      evicted,
      apps: [...apps.values()],
      events: events.filter((e) => e.id > after).slice(0, 100),
    };
  }
  function normalize(event, app) {
    if (
      !object(event) ||
      !["heartbeat", "network", "log", "error"].includes(event.type) ||
      !object(event.data)
    )
      throw new Error("Invalid SDK event");
    const d = event.data;
    const timestamp = text(event.timestamp, 80) || new Date().toISOString();
    let data;
    if (event.type === "network") {
      if (!text(d.url, 16000)) throw new Error("Network event requires a URL");
      data = {
        timestamp: text(d.timestamp, 80) || timestamp,
        method: text(d.method, 20) || "GET",
        url: text(d.url, 16000),
        status: Math.min(599, finite(d.status)),
        duration: finite(d.duration),
        size: finite(d.size),
        requestHeaders: headers(d.requestHeaders),
        responseHeaders: headers(d.responseHeaders),
        requestBody: text(d.requestBody, 4096),
        responseBody: text(d.responseBody, 4096),
        requestTruncated: !!d.requestTruncated,
        responseTruncated: !!d.responseTruncated,
        encoding: "",
        mimeType: text(d.mimeType, 200),
        timings: { headers: finite(d.duration) },
        error: text(d.error),
        captureKind: "sdk",
      };
    } else if (event.type === "heartbeat") data = {};
    else {
      const message = text(d.message);
      data = {
        timestamp,
        level:
          event.type === "error"
            ? "ERROR"
            : text(d.level, 20).toUpperCase() || "INFO",
        source: app.appName,
        message,
        raw: JSON.stringify({
          timestamp,
          level: event.type === "error" ? "ERROR" : text(d.level, 20),
          source: app.appName,
          message,
          stack: text(d.stack),
        }),
      };
    }
    return {
      type: event.type,
      timestamp,
      appId: app.appId,
      instanceId: app.instanceId,
      data,
    };
  }
  async function read(req) {
    const chunks = [];
    let length = 0;
    for await (const chunk of req) {
      length += chunk.length;
      if (length > MAX_BYTES) throw new Error("SDK payload exceeds 256 KB");
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  }
  async function middleware(req, res, next) {
    const route = new URL(req.url || "/", controlOrigin);
    if (!route.pathname.startsWith("/__edith_sdk/")) {
      next();
      return;
    }
    if (!hosts.has(req.headers.host)) {
      json(res, 403, { error: "Loopback workspace host required" });
      return;
    }
    const origin =
      typeof req.headers.origin === "string" ? req.headers.origin : undefined;
    const isIngest =
      route.pathname === "/__edith_sdk/events" &&
      ["POST", "OPTIONS"].includes(req.method);
    if (isIngest) {
      if (req.method === "OPTIONS") {
        if (!enabled) {
          json(res, 403, { error: "SDK receiver is disabled" });
          return;
        }
        res.writeHead(204, {
          "Access-Control-Allow-Origin": origin || "null",
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "authorization, content-type",
          "Access-Control-Max-Age": "60",
          Vary: "Origin",
        });
        res.end();
        return;
      }
      if (
        !enabled ||
        !equal(
          String(req.headers.authorization || "").replace(/^Bearer /, ""),
          pairingToken,
        )
      ) {
        json(
          res,
          403,
          { error: "SDK receiver disabled or invalid pairing token" },
          origin,
        );
        return;
      }
      if (!String(req.headers["content-type"]).startsWith("application/json")) {
        json(res, 415, { error: "Expected JSON" }, origin);
        return;
      }
      try {
        const payload = await read(req);
        if (
          !object(payload) ||
          payload.version !== 1 ||
          !text(payload.appId, 80) ||
          !text(payload.instanceId, 100) ||
          !Array.isArray(payload.events) ||
          payload.events.length > 10
        )
          throw new Error(
            "Expected SDK protocol v1, app identity, and up to 10 events",
          );
        const key = `${text(payload.appId, 80)}:${text(payload.instanceId, 100)}`;
        if (!apps.has(key) && apps.size >= MAX_APPS)
          throw new Error("SDK receiver supports at most 16 app instances");
        const app = {
          key,
          appId: text(payload.appId, 80),
          appName: text(payload.appName, 80) || text(payload.appId, 80),
          instanceId: text(payload.instanceId, 100),
          lastSeen: new Date().toISOString(),
        };
        const normalized = payload.events.map((event) => normalize(event, app));
        apps.set(key, app);
        for (const event of normalized) {
          if (event.type === "heartbeat") continue;
          const id = ++sequence;
          events.push({ ...event, id, data: { ...event.data, id } });
          if (events.length > MAX_EVENTS) {
            events.shift();
            evicted++;
          }
        }
        json(res, 202, { accepted: normalized.length }, origin);
      } catch (error) {
        json(res, 400, { error: error.message }, origin);
      }
      return;
    }
    if (
      (origin && origin !== `${url.protocol}//${req.headers.host}`) ||
      req.headers["sec-fetch-site"] === "cross-site"
    ) {
      json(res, 403, { error: "Workspace origin required" });
      return;
    }
    if (req.method === "GET" && route.pathname === "/__edith_sdk/status") {
      json(res, 200, {
        ...state(),
        controlToken,
        pairingToken: enabled ? pairingToken : undefined,
      });
      return;
    }
    if (req.method === "GET" && route.pathname === "/__edith_sdk/events") {
      const after = Number(route.searchParams.get("after") || 0);
      if (!Number.isSafeInteger(after) || after < 0) {
        json(res, 400, { error: "Invalid cursor" });
        return;
      }
      json(res, 200, state(after));
      return;
    }
    if (
      req.method === "POST" &&
      ["/__edith_sdk/enable", "/__edith_sdk/disable"].includes(route.pathname)
    ) {
      if (!equal(req.headers["x-edith-token"], controlToken)) {
        json(res, 403, { error: "Invalid local control token" });
        return;
      }
      enabled = route.pathname.endsWith("/enable");
      pairingToken = enabled ? randomBytes(32).toString("hex") : "";
      apps.clear();
      events = [];
      sequence = evicted = 0;
      json(res, 200, {
        ...state(),
        pairingToken: enabled ? pairingToken : undefined,
      });
      return;
    }
    json(res, 404, { error: "Unknown SDK route" });
  }
  return { middleware, state };
}
