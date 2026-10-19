import http from "node:http";
import { once } from "node:events";
import { createEdith } from "../../packages/sdk/src/index.mjs";
const token = process.env.EDITH_TOKEN;
if (!token) {
  console.error(
    "Enable SDK receiver in EDITH, then set EDITH_TOKEN to the pairing token from the setup snippet.",
  );
  process.exitCode = 1;
} else {
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/checkout") {
      res.statusCode = 503;
      res.end(JSON.stringify({ error: "Demo payment provider unavailable" }));
    } else
      res.end(
        JSON.stringify({
          products: [{ id: "demo", name: "Everyday backpack" }],
        }),
      );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const edith = createEdith({
    enabled: true,
    appId: "edith-demo",
    appName: "EDITH demo app",
    endpoint:
      process.env.EDITH_ENDPOINT || "http://127.0.0.1:1420/__edith_sdk/events",
    token,
    captureBodies: true,
  });
  // This sample opts into global fetch instrumentation; it touches no system proxy settings.
  edith.install();
  let cycle = 0,
    working = false;
  async function run() {
    if (working) return;
    working = true;
    try {
      await fetch(base + "/products").then((r) => r.json());
      const response = await fetch(base + "/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: "demo", quantity: 1 }),
      });
      await response.text();
      edith.log("INFO", `Demo cycle ${++cycle}: products loaded`);
      edith.log("WARN", "Checkout returned an intentional demo 503");
      edith.captureError(
        new Error("Demonstration error: payment provider unavailable"),
      );
      const status = await edith.flush();
      console.log(
        `Demo cycle ${cycle}: ${status.sent} events delivered${status.lastError ? `; delivery issue: ${status.lastError}` : ""}`,
      );
    } finally {
      working = false;
    }
  }
  console.log(
    "EDITH demo running. Network and Logs will receive local fixture activity. Press Ctrl+C to stop.",
  );
  await run();
  const interval = setInterval(() => void run(), 5000);
  async function shutdown() {
    clearInterval(interval);
    await edith.flush();
    edith.dispose();
    server.close();
    server.closeAllConnections();
  }
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  if (process.argv.includes("--once")) await shutdown();
}
