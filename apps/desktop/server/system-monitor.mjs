import os from "node:os";
export function cpuPercent(previous, current) {
  if (!previous || previous.length !== current.length || !current.length)
    return { total: null, cores: current.map(() => null) };
  let allBusy = 0,
    allTime = 0;
  const cores = current.map((cpu, i) => {
    const before = previous[i].times,
      now = cpu.times;
    let total = 0;
    for (const key of Object.keys(now)) {
      const delta = now[key] - before[key];
      if (!Number.isFinite(delta) || delta < 0) return null;
      total += delta;
    }
    const idle = now.idle - before.idle;
    if (total <= 0) return null;
    allTime += total;
    allBusy += total - idle;
    return Math.max(0, Math.min(100, ((total - idle) / total) * 100));
  });
  return {
    total:
      cores.some((c) => c === null) || allTime <= 0
        ? null
        : Math.max(0, Math.min(100, (allBusy / allTime) * 100)),
    cores,
  };
}
export function createSystemMonitor({
  controlOrigin = "http://127.0.0.1:1420",
  provider = os,
  now = Date.now,
} = {}) {
  let previous = null,
    cached = null,
    lastAt = 0;
  const url = new URL(controlOrigin),
    hosts = new Set([
      url.host,
      `localhost:${url.port}`,
      `127.0.0.1:${url.port}`,
    ]);
  function sample(reset = false) {
    const timestamp = now();
    if (!reset && cached && timestamp - lastAt < 900) return cached;
    const current = provider.cpus();
    const cpu = cpuPercent(reset ? null : previous, current);
    previous = current;
    const total = Math.max(0, provider.totalmem()),
      free = Math.min(total, Math.max(0, provider.freemem()));
    cached = {
      timestamp,
      cpuPercent: cpu.total,
      cores: cpu.cores,
      memoryTotalBytes: total,
      memoryFreeBytes: free,
      memoryUsedBytes: total - free,
      memoryPercent: total ? ((total - free) / total) * 100 : 0,
      cpuModel: current[0]?.model || "Unavailable",
      logicalCores: current.length,
      platform: provider.platform(),
      arch: provider.arch(),
      source: "node-os",
    };
    lastAt = timestamp;
    return cached;
  }
  function middleware(req, res, next) {
    const route = new URL(req.url || "/", controlOrigin);
    if (route.pathname !== "/__edith_system/snapshot") {
      next();
      return;
    }
    const origin = req.headers.origin;
    if (
      !hosts.has(req.headers.host) ||
      (origin && origin !== `${url.protocol}//${req.headers.host}`) ||
      req.headers["sec-fetch-site"] === "cross-site"
    ) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "System metrics are available only to this local workspace.",
        }),
      );
      return;
    }
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" });
      res.end();
      return;
    }
    try {
      const value = sample(route.searchParams.get("reset") === "1");
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(JSON.stringify(value));
    } catch (error) {
      res.writeHead(503, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify({ error: error.message }));
    }
  }
  return { sample, middleware };
}
