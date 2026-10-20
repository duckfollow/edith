import http from "node:http";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

export function createExampleApi({ log = console.log } = {}) {
  const users = [
    { id: "1", name: "Alice" },
    { id: "2", name: "Bob" },
  ];
  return http.createServer(async (req, res) => {
    const started = Date.now();
    const requestId = randomUUID();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("X-Request-Id", requestId);
    res.setHeader("Cache-Control", "no-store");
    res.once("finish", () =>
      log(
        JSON.stringify({
          time: new Date().toISOString(),
          level:
            res.statusCode >= 500
              ? "ERROR"
              : res.statusCode >= 400
                ? "WARN"
                : "INFO",
          requestId,
          method: req.method,
          path: req.url,
          status: res.statusCode,
          durationMs: Date.now() - started,
        }),
      ),
    );
    function send(status, data) {
      res.statusCode = status;
      res.end(req.method === "HEAD" ? undefined : JSON.stringify(data));
    }
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      const path = url.pathname;
      if (req.method === "GET" && path === "/")
        return send(200, {
          name: "EDITH example API",
          endpoints: [
            "GET /health",
            "GET /users",
            'POST /users {"name":"Charlie"}',
            "GET /slow?ms=1000",
            "GET /error",
          ],
        });
      if (req.method === "GET" && path === "/health")
        return send(200, { status: "ok" });
      if (req.method === "GET" && path === "/users")
        return send(200, { users });
      if (req.method === "POST" && path === "/users") {
        if (
          !/^application\/json(?:\s*;|$)/i.test(
            req.headers["content-type"] || "",
          )
        )
          return send(415, { error: "Use Content-Type: application/json" });
        let body = "",
          bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 16 * 1024) {
            send(413, { error: "Body exceeds 16 KiB" });
            return;
          }
          body += chunk.toString();
        }
        let data;
        try {
          data = JSON.parse(body);
        } catch {
          return send(400, { error: "Invalid JSON" });
        }
        if (
          !data ||
          typeof data.name !== "string" ||
          !data.name.trim() ||
          data.name.length > 100
        )
          return send(400, { error: "name must contain 1–100 characters" });
        if (users.length >= 1000)
          return send(409, {
            error: "Demo limit reached; restart to reset users",
          });
        const user = { id: randomUUID(), name: data.name.trim() };
        users.push(user);
        return send(201, { user });
      }
      if (req.method === "GET" && path === "/slow") {
        const ms = Number(url.searchParams.get("ms") ?? 1000);
        if (!Number.isInteger(ms) || ms < 0 || ms > 5000)
          return send(400, { error: "ms must be an integer from 0 to 5000" });
        await new Promise((resolve) => setTimeout(resolve, ms));
        return send(200, { delayedMs: ms });
      }
      if (req.method === "GET" && path === "/error")
        return send(503, {
          error: "Simulated upstream failure",
          simulated: true,
        });
      if (["/", "/health", "/users", "/slow", "/error"].includes(path)) {
        res.setHeader("Allow", path === "/users" ? "GET, POST" : "GET");
        return send(405, { error: "Method not allowed" });
      }
      send(404, { error: "Not found" });
    } catch {
      if (!res.headersSent && !res.destroyed)
        send(500, { error: "Request failed" });
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error("PORT must be 1–65535");
  const server = createExampleApi();
  server.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(`EDITH example API: http://127.0.0.1:${port} (Ctrl+C to stop)`),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      server.close();
      server.closeAllConnections();
    });
}
