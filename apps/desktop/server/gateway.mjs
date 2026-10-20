import http from "node:http";
import https from "node:https";
import { randomBytes } from "node:crypto";

const hop = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
function headers(input) {
  const blocked = new Set([
    ...hop,
    ...(input.connection || "")
      .toLowerCase()
      .split(",")
      .map((s) => s.trim()),
  ]);
  return Object.fromEntries(
    Object.entries(input).filter(([k]) => !blocked.has(k.toLowerCase())),
  );
}
export function validateGateway(c, controlPort = 1420) {
  if (
    !c ||
    !Number.isInteger(c.port) ||
    c.port < 1024 ||
    c.port > 65535 ||
    [controlPort, 8899].includes(c.port)
  )
    throw Error("Invalid or reserved listener port");
  if (!Array.isArray(c.routes) || !c.routes.length || c.routes.length > 20)
    throw Error("Configure 1–20 routes");
  const paths = new Set();
  const routes = c.routes.map((r) => {
    if (
      !r ||
      typeof r.path !== "string" ||
      !/^\/(?:[A-Za-z0-9._~!$&'()+,;=@%-]+\/?)*$/.test(r.path) ||
      r.path.includes("..") ||
      paths.has(r.path)
    )
      throw Error("Invalid or duplicate route path");
    paths.add(r.path);
    if (
      typeof r.enabled !== "boolean" ||
      typeof r.strip !== "boolean" ||
      typeof r.connected !== "boolean" ||
      (r.enabled && !r.connected)
    )
      throw Error("Connect every enabled route");
    const target = new URL(r.target);
    if (
      !["http:", "https:"].includes(target.protocol) ||
      target.username ||
      target.password ||
      target.search ||
      target.hash
    )
      throw Error("Invalid backend URL");
    // Forbid every backend using our listener/control ports, including hostname aliases.
    if (
      [c.port, controlPort, 8899].includes(
        Number(target.port || (target.protocol === "https:" ? 443 : 80)),
      )
    )
      throw Error("Backend port would create a proxy loop");
    return {
      ...r,
      path: r.path === "/" ? "/" : r.path.replace(/\/$/, ""),
      target: target.href,
    };
  });
  if (new Set(routes.map((r) => r.path)).size !== routes.length)
    throw Error("Duplicate normalized route path");
  if (!routes.some((r) => r.enabled)) throw Error("Enable at least one route");
  return {
    port: c.port,
    routes: routes.sort((a, b) => b.path.length - a.path.length),
  };
}
export function createGateway({
  controlOrigin = "http://127.0.0.1:1420",
  onCapture = () => {},
  forbiddenPorts = () => [],
  forbiddenListenerPorts = () => [],
} = {}) {
  const control = new URL(controlOrigin),
    token = randomBytes(24).toString("hex");
  const hosts = new Set([
    control.host,
    `localhost:${control.port}`,
    `127.0.0.1:${control.port}`,
  ]);
  let server = null,
    config = null,
    pending = false;
  let sequence = 0;
  const records = [];
  const logs = [];
  const captureHeaders = (h) =>
    Object.entries(h).flatMap(([name, value]) =>
      (Array.isArray(value) ? value : [value])
        .filter((v) => v !== undefined)
        .map((value) => ({ name, value: String(value) })),
    );
  function preview() {
    const chunks = [];
    let total = 0,
      retained = 0;
    return {
      add(chunk) {
        const data = Buffer.from(chunk);
        total += data.length;
        const n = Math.min(32768 - retained, data.length);
        if (n > 0) {
          chunks.push(data.subarray(0, n));
          retained += n;
        }
      },
      result(type = "") {
        const data = Buffer.concat(chunks);
        const text = /json|text|xml|javascript|form-urlencoded/i.test(type);
        return {
          body: text ? data.toString("utf8") : data.toString("base64"),
          encoding: text ? "utf8" : "base64",
          truncated: total > retained,
          size: total,
        };
      },
    };
  }
  const sockets = new Set(),
    upstreams = new Set();
  const snapshot = () => ({
    running: !!server?.listening,
    port: server?.address()?.port || null,
    config,
    token,
  });
  async function stop() {
    const current = server;
    if (!current) return;
    for (const upstream of upstreams) upstream.destroy();
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => current.close(resolve));
    server = null;
    config = null;
  }
  async function start(input) {
    if (pending) throw Error("Gateway operation in progress");
    if (server)
      throw Error("Stop the running gateway before changing its setup");
    const next = validateGateway(input, Number(control.port));
    const blocked = forbiddenPorts();
    if (
      forbiddenListenerPorts().includes(next.port) ||
      blocked.includes(next.port) ||
      next.routes.some((r) =>
        blocked.includes(
          Number(
            new URL(r.target).port ||
              (new URL(r.target).protocol === "https:" ? 443 : 80),
          ),
        ),
      )
    )
      throw Error("Port conflicts with another Gateway or its backend");
    pending = true;
    const listener = http.createServer({ maxHeaderSize: 16384 }, (req, res) => {
      const fail = (status, message) => {
        if (res.headersSent) return res.destroy();
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: message }));
      };
      if (
        ![`127.0.0.1:${next.port}`, `localhost:${next.port}`].includes(
          req.headers.host,
        )
      )
        return fail(403, "Use the local gateway address");
      if (!req.url?.startsWith("/") || req.url.startsWith("//"))
        return fail(400, "Origin-form request required");
      const q = req.url.indexOf("?"),
        path = q < 0 ? req.url : req.url.slice(0, q),
        query = q < 0 ? "" : req.url.slice(q);
      const route = next.routes.find(
        (r) =>
          r.enabled &&
          (r.path === "/" || path === r.path || path.startsWith(r.path + "/")),
      );
      if (!route) return fail(404, "No gateway route matches this path");
      if (upstreams.size >= 64)
        return fail(503, "Gateway connection limit reached");
      const started = Date.now(),
        timestamp = new Date().toISOString();
      const requestPreview = preview(),
        responsePreview = preview();
      let responseHeaders = {},
        captureError = "",
        captured = false;
      req.on("data", (chunk) => requestPreview.add(chunk));
      function finish() {
        if (captured) return;
        captured = true;
        const request = requestPreview.result(
            req.headers["content-encoding"]
              ? ""
              : req.headers["content-type"] || "",
          ),
          response = responsePreview.result(
            responseHeaders["content-encoding"]
              ? ""
              : responseHeaders["content-type"] || "",
          );
        const id = ++sequence;
        const entry = {
          id,
          timestamp,
          captureKind: "gateway",
          routeId: route.id || route.path,
          routePath: route.path,
          upstream: route.target,
          method: req.method,
          url: `http://127.0.0.1:${next.port}${req.url}`,
          status: res.writableFinished ? res.statusCode : 0,
          duration: Date.now() - started,
          size: response.size,
          requestHeaders: captureHeaders(req.headers),
          responseHeaders: captureHeaders(responseHeaders),
          requestBody: request.body,
          responseBody: response.body,
          requestEncoding: request.encoding,
          encoding: response.encoding,
          requestTruncated: request.truncated,
          responseTruncated: response.truncated,
          mimeType: responseHeaders["content-type"] || "",
          timings: {},
          error:
            captureError ||
            (!res.writableFinished
              ? "Connection closed before completion"
              : undefined),
        };
        records.push(entry);
        if (records.length > 256) records.shift();
        if (entry.error || entry.status >= 500) {
          logs.push({
            id,
            timestamp,
            level: "ERROR",
            source: `Gateway ${route.path}`,
            message: `${req.method} ${req.url} → ${entry.status || "Failed"}: ${entry.error || "Backend returned an error"}`,
            raw: JSON.stringify({
              route: route.path,
              target: route.target,
              status: entry.status,
              error: entry.error,
            }),
          });
          if (logs.length > 256) logs.shift();
        }
        onCapture(entry, logs.at(-1)?.id === id ? logs.at(-1) : null);
      }
      res.once("finish", finish);
      res.once("close", finish);
      const target = new URL(route.target);
      const tail =
        route.strip && route.path !== "/"
          ? path.slice(route.path.length)
          : path;
      const upstreamPath =
        target.pathname.replace(/\/$/, "") +
        (tail.startsWith("/") ? tail : "/" + tail) +
        query;
      const h = headers(req.headers);
      h.host = target.host;
      delete h["forwarded"];
      delete h["x-forwarded-for"];
      delete h["x-forwarded-host"];
      delete h["x-forwarded-proto"];
      h["x-forwarded-for"] = req.socket.remoteAddress;
      h["x-forwarded-host"] = req.headers.host || "";
      h["x-forwarded-proto"] = "http";
      const upstream = (target.protocol === "https:" ? https : http).request(
        target,
        { method: req.method, path: upstreamPath, headers: h },
        (response) => {
          responseHeaders = headers(response.headers);
          res.writeHead(response.statusCode || 502, responseHeaders);
          response.on("data", (chunk) => responsePreview.add(chunk));
          response.on("error", (error) => {
            captureError = error.message;
            res.destroy();
          });
          response.pipe(res);
        },
      );
      upstreams.add(upstream);
      upstream.once("close", () => upstreams.delete(upstream));
      upstream.setTimeout(30000, () =>
        upstream.destroy(Error("Upstream timed out")),
      );
      upstream.on("error", (error) => {
        captureError = error.message;
        fail(502, error.message);
      });
      req.on("aborted", () => upstream.destroy());
      res.on("close", () => {
        if (!res.writableFinished) upstream.destroy();
      });
      req.pipe(upstream);
    });
    listener.requestTimeout = 30000;
    listener.headersTimeout = 10000;
    listener.on("connection", (socket) => {
      if (sockets.size >= 64) {
        socket.destroy();
        return;
      }
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
    });
    listener.on("upgrade", (_req, socket) =>
      socket.end("HTTP/1.1 501 Not Implemented\r\nConnection: close\r\n\r\n"),
    );
    listener.on("connect", (_req, socket) =>
      socket.end(
        "HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\n\r\n",
      ),
    );
    try {
      await new Promise((resolve, reject) => {
        listener.once("error", reject);
        listener.listen(next.port, "127.0.0.1", resolve);
      });
      server = listener;
      config = next;
    } finally {
      pending = false;
    }
  }
  async function middleware(req, res, next) {
    const path = req.url?.split("?")[0];
    if (!path?.startsWith("/__edith_gateway/")) return next();
    const send = (status, data) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(data));
    };
    if (
      !hosts.has(req.headers.host) ||
      (req.headers.origin &&
        req.headers.origin !== `http://${req.headers.host}`) ||
      req.headers["sec-fetch-site"] === "cross-site"
    )
      return send(403, { error: "Local workspace only" });
    if (path === "/__edith_gateway/events" && req.method === "GET") {
      const after = Number(
        new URL(req.url, controlOrigin).searchParams.get("after") || 0,
      );
      if (!Number.isSafeInteger(after) || after < 0)
        return send(400, { error: "Invalid cursor" });
      return send(200, {
        lastId: sequence,
        records: records.filter((r) => r.id > after),
        logs: logs.filter((r) => r.id > after),
      });
    }
    if (path === "/__edith_gateway/status" && req.method === "GET")
      return send(200, snapshot());
    if (req.method !== "POST") return send(405, { error: "Use POST" });
    if (req.headers["x-edith-token"] !== token)
      return send(403, { error: "Invalid control token" });
    if (!["/__edith_gateway/start", "/__edith_gateway/stop"].includes(path))
      return send(404, { error: "Unknown action" });
    if (pending) return send(409, { error: "Gateway operation in progress" });
    try {
      if (path.endsWith("/start")) {
        if (!req.headers["content-type"]?.startsWith("application/json"))
          return send(415, { error: "JSON required" });
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 32768)
            return send(413, { error: "Configuration too large" });
        }
        await start(JSON.parse(body));
      } else {
        pending = true;
        try {
          await stop();
        } finally {
          pending = false;
        }
      }
      send(200, snapshot());
    } catch (error) {
      send(400, { error: error.message });
    }
  }
  return { start, stop, snapshot, middleware };
}
