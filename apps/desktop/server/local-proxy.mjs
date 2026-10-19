import http from "node:http";
import net from "node:net";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export const BODY_LIMIT = 32 * 1024;
export const RECORD_LIMIT = 256;
const HOP_HEADERS = new Set([
  "connection",
  "proxy-connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "proxy-authenticate",
  "proxy-authorization",
]);
function cleanHeaders(headers) {
  const nominated = String(headers.connection || "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim());
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) =>
        !HOP_HEADERS.has(name.toLowerCase()) &&
        !nominated.includes(name.toLowerCase()),
    ),
  );
}
function headerList(headers) {
  return Object.entries(headers).flatMap(([name, value]) =>
    (Array.isArray(value) ? value : [value])
      .filter((v) => v !== undefined)
      .map((value) => ({ name, value: String(value) })),
  );
}
function collector() {
  let retained = 0,
    total = 0;
  const chunks = [];
  return {
    push(chunk) {
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += data.length;
      const keep = Math.min(data.length, BODY_LIMIT - retained);
      if (keep > 0) {
        chunks.push(Buffer.from(data.subarray(0, keep)));
        retained += keep;
      }
    },
    result(contentType = "", encoding = "") {
      const buffer = Buffer.concat(chunks);
      const textual = /text|json|xml|javascript|urlencoded|graphql/i.test(
        contentType,
      );
      return {
        text:
          textual && !encoding
            ? buffer.toString("utf8")
            : buffer.toString("base64"),
        encoding: textual && !encoding ? "" : "base64",
        total,
        truncated: total > retained,
      };
    },
  };
}
function json(res, status, value) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}
export function createLocalProxy({
  controlOrigin = "http://127.0.0.1:1420",
  dial = net.connect,
} = {}) {
  const authority = new URL(controlOrigin).host;
  const controlUrl = new URL(controlOrigin);
  const authorities = new Set([authority]);
  if (["127.0.0.1", "localhost", "[::1]"].includes(controlUrl.hostname)) {
    for (const host of ["127.0.0.1", "localhost", "[::1]"])
      authorities.add(`${host}:${controlUrl.port}`);
  }
  const token = randomBytes(32).toString("hex");
  let server = null,
    port = null,
    state = "stopped",
    sessionId = randomUUID(),
    sequence = 0,
    total = 0,
    evicted = 0;
  let records = [],
    pendingStart = null,
    pendingStop = null;
  const sockets = new Set();
  function snapshot(after = 0) {
    return {
      state,
      port,
      sessionId,
      total,
      evicted,
      lastId: sequence,
      records: records.filter((r) => r.id > after).slice(0, 50),
      oldestId: records[0]?.id ?? sequence + 1,
      activeConnections: sockets.size,
    };
  }
  function add(entry, sid) {
    if (sid !== sessionId || state !== "running") return;
    records.push({ ...entry, id: ++sequence });
    total++;
    if (records.length > RECORD_LIMIT) {
      records.shift();
      evicted++;
    }
  }
  function entry(req, url, kind = "http") {
    return {
      timestamp: new Date().toISOString(),
      method: req.method || "GET",
      url,
      status: 0,
      duration: 0,
      size: 0,
      requestHeaders: headerList(req.headers),
      responseHeaders: [],
      requestBody: "",
      responseBody: "",
      encoding: "",
      mimeType: "",
      timings: {},
      captureKind: kind,
      requestTruncated: false,
      responseTruncated: false,
      error: "",
    };
  }
  function track(socket) {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    return socket;
  }
  function refuseLoop(_host, targetPort) {
    if ([port, Number(new URL(controlOrigin).port || 80)].includes(targetPort))
      throw new Error("Proxy/control self-targets are not allowed.");
  }
  function handleHttp(req, res) {
    const sid = sessionId;
    let target;
    try {
      target = new URL(req.url || "");
      if (target.protocol !== "http:" || target.username || target.password)
        throw new Error("Use an absolute http:// URL; HTTPS must use CONNECT.");
      refuseLoop(target.hostname, Number(target.port || 80));
    } catch (error) {
      res.writeHead(400, { "Content-Type": "text/plain", Connection: "close" });
      res.end(error.message);
      return;
    }
    if (sockets.size > 64) {
      res.writeHead(503, { Connection: "close" });
      res.end("Too many active proxy connections");
      return;
    }
    const item = entry(req, target.toString()),
      started = performance.now();
    const requestCapture = collector(),
      responseCapture = collector();
    let finalized = false,
      upstream;
    function finish(error = "") {
      if (finalized) return;
      finalized = true;
      item.duration = performance.now() - started;
      item.timings = { total: item.duration };
      const requestBody = requestCapture.result(
        String(req.headers["content-type"] || ""),
        String(req.headers["content-encoding"] || ""),
      );
      item.requestBody = requestBody.text;
      item.requestEncoding = requestBody.encoding;
      item.requestTruncated = requestBody.truncated;
      const responseBody = responseCapture.result(
        item.mimeType,
        item.contentEncoding,
      );
      item.responseBody = responseBody.text;
      item.encoding = responseBody.encoding;
      item.responseTruncated = responseBody.truncated;
      item.size = responseBody.total;
      item.error = error;
      add(item, sid);
    }
    const headers = cleanHeaders(req.headers);
    headers.host = target.host;
    try {
      upstream = http.request(
        target,
        { method: req.method, headers, agent: false },
        (response) => {
          track(response.socket);
          item.status = response.statusCode || 502;
          item.responseHeaders = headerList(response.headers);
          item.mimeType = String(response.headers["content-type"] || "");
          item.contentEncoding = String(
            response.headers["content-encoding"] || "",
          );
          res.writeHead(item.status, cleanHeaders(response.headers));
          response.on("data", (chunk) => responseCapture.push(chunk));
          response.on("end", () => finish());
          response.on("aborted", () => {
            finish("Upstream response aborted");
            res.destroy();
          });
          response.on("error", (error) => {
            finish(error.message);
            res.destroy();
          });
          response.pipe(res);
        },
      );
    } catch (error) {
      item.status = 502;
      finish(error.message);
      res.writeHead(502);
      res.end("Proxy request failed");
      return;
    }
    upstream.on("socket", (socket) => track(socket));
    upstream.setTimeout(30000, () =>
      upstream.destroy(new Error("Upstream idle timeout after 30 seconds")),
    );
    upstream.on("error", (error) => {
      if (!res.headersSent) {
        item.status = 502;
        res.writeHead(502, { "Content-Type": "text/plain" });
        res.end("EDITH proxy could not reach the upstream server.");
      } else res.destroy();
      finish(error.message);
    });
    req.on("data", (chunk) => requestCapture.push(chunk));
    req.on("aborted", () =>
      upstream.destroy(new Error("Client aborted request")),
    );
    req.on("error", (error) => upstream.destroy(error));
    res.on("close", () => {
      if (!res.writableFinished) {
        finish("Client disconnected before response completed");
        upstream.destroy();
      }
    });
    req.pipe(upstream);
  }
  function handleConnect(req, client, head) {
    const sid = sessionId;
    let target;
    try {
      target = new URL(`http://${req.url}`);
      if (
        !target.port ||
        target.pathname !== "/" ||
        target.search ||
        target.hash ||
        target.username ||
        target.password
      )
        throw new Error("Invalid CONNECT authority");
      const targetPort = Number(target.port);
      if (targetPort !== 443)
        throw new Error("CONNECT currently supports port 443 only");
      refuseLoop(target.hostname, targetPort);
    } catch (error) {
      client.end(
        "HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n" + error.message,
      );
      return;
    }
    if (sockets.size > 64) {
      client.end("HTTP/1.1 503 Service Unavailable\r\n\r\n");
      return;
    }
    const item = entry(req, `https://${target.host}/`, "tunnel"),
      started = performance.now();
    let recorded = false;
    function record(status, error = "") {
      if (recorded) return;
      recorded = true;
      item.status = status;
      item.duration = performance.now() - started;
      item.timings = { connect: item.duration };
      item.error = error;
      item.responseBody =
        "Encrypted tunnel: HTTPS headers, URL paths, and payloads are not decrypted.";
      item.mimeType = "application/x-https-tunnel";
      add(item, sid);
    }
    const upstream = track(
      dial({ host: target.hostname.replace(/^\[|\]$/g, ""), port: 443 }),
    );
    upstream.setTimeout(60000, () =>
      upstream.destroy(new Error("Tunnel idle timeout after 60 seconds")),
    );
    upstream.once("connect", () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      record(200);
      if (head.length) upstream.write(head);
      client.pipe(upstream);
      upstream.pipe(client);
    });
    upstream.once("error", (error) => {
      if (!recorded) {
        client.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
        record(502, error.message);
      } else client.destroy();
    });
    client.on("close", () => upstream.destroy());
    client.on("error", () => upstream.destroy());
    upstream.on("close", () => client.destroy());
  }
  async function start(requestedPort = 8899) {
    if (state === "running") return snapshot();
    if (pendingStart) return pendingStart;
    if (pendingStop) {
      await pendingStop;
      if (state === "running") return snapshot();
      if (pendingStart) return pendingStart;
    }
    if (
      !Number.isInteger(requestedPort) ||
      requestedPort < 0 ||
      requestedPort > 65535 ||
      (requestedPort > 0 && requestedPort < 1024)
    )
      throw new Error("Port must be between 1024 and 65535.");
    state = "starting";
    pendingStart = (async () => {
      const instance = http.createServer({ maxHeaderSize: 16384 }, handleHttp);
      server = instance;
      instance.maxConnections = 64;
      instance.requestTimeout = 60000;
      instance.headersTimeout = 15000;
      instance.keepAliveTimeout = 5000;
      instance.on("connection", track);
      instance.on("connect", handleConnect);
      instance.on("upgrade", (_req, socket) =>
        socket.end("HTTP/1.1 501 Not Implemented\r\nConnection: close\r\n\r\n"),
      );
      instance.on("clientError", (_error, socket) => {
        if (socket.writable)
          socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
      });
      try {
        await new Promise((resolve, reject) => {
          instance.once("error", reject);
          instance.listen(requestedPort, "127.0.0.1", () => {
            instance.removeListener("error", reject);
            resolve();
          });
        });
        instance.on("error", () => {});
        port = instance.address().port;
        records = [];
        sequence = total = evicted = 0;
        sessionId = randomUUID();
        state = "running";
        return snapshot();
      } catch (error) {
        state = "stopped";
        port = null;
        server = null;
        throw error;
      }
    })();
    try {
      return await pendingStart;
    } finally {
      pendingStart = null;
    }
  }
  async function stop() {
    if (pendingStop) return pendingStop;
    if (pendingStart) {
      try {
        await pendingStart;
      } catch {
        return snapshot();
      }
    }
    if (pendingStop) return pendingStop;
    if (!server) return snapshot();
    state = "stopping";
    const instance = server;
    pendingStop = (async () => {
      await new Promise((resolve) => {
        instance.close(resolve);
        for (const socket of sockets) socket.destroy();
      });
      server = null;
      port = null;
      state = "stopped";
      return snapshot();
    })();
    try {
      return await pendingStop;
    } finally {
      pendingStop = null;
    }
  }
  async function middleware(req, res, next) {
    const route = new URL(req.url || "/", controlOrigin);
    if (!route.pathname.startsWith("/__edith_proxy/")) {
      next();
      return;
    }
    const origin = req.headers.origin;
    if (
      !authorities.has(req.headers.host) ||
      (origin && origin !== `${controlUrl.protocol}//${req.headers.host}`) ||
      req.headers["sec-fetch-site"] === "cross-site"
    ) {
      json(res, 403, {
        error:
          "Proxy controls are available only to this local workspace origin.",
      });
      return;
    }
    if (req.method === "GET" && route.pathname === "/__edith_proxy/status") {
      json(res, 200, { ...snapshot(Number.MAX_SAFE_INTEGER), token });
      return;
    }
    if (req.method === "GET" && route.pathname === "/__edith_proxy/events") {
      const after = Number(route.searchParams.get("after") || 0);
      if (!Number.isSafeInteger(after) || after < 0) {
        json(res, 400, { error: "Invalid event cursor" });
        return;
      }
      json(res, 200, snapshot(after));
      return;
    }
    if (
      req.method !== "POST" ||
      !["/__edith_proxy/start", "/__edith_proxy/stop"].includes(route.pathname)
    ) {
      json(res, 404, { error: "Unknown proxy action" });
      return;
    }
    const supplied = Buffer.from(String(req.headers["x-edith-token"] || ""));
    const expected = Buffer.from(token);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      json(res, 403, { error: "Missing or invalid local control token" });
      return;
    }
    if (
      String(req.headers["content-type"]).split(";")[0] !== "application/json"
    ) {
      json(res, 415, { error: "Expected application/json" });
      return;
    }
    let raw = "";
    try {
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 1024) throw new Error("Control payload too large");
      }
      const input = JSON.parse(raw || "{}");
      if (route.pathname.endsWith("/start")) {
        const requested = input.port ?? 8899;
        if (requested === 0)
          throw new Error("Choose a port between 1024 and 65535.");
        json(res, 200, await start(requested));
      } else json(res, 200, await stop());
    } catch (error) {
      json(res, 400, { error: error.message });
    }
  }
  return { start, stop, snapshot, middleware };
}
