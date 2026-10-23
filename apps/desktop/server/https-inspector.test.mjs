import { inspectionSettings, shouldInspectHost } from "./https-inspector.mjs";
import net from "node:net";
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import { once } from "node:events";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHttpsInspector, inspectionDomains } from "./https-inspector.mjs";
import { createLocalProxy } from "./local-proxy.mjs";
const exec = promisify(execFile);
async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "edith-tls-"));
  await writeFile(
    path.join(dir, "ca.cnf"),
    "[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ext\n[dn]\nCN=EDITH test CA\n[ext]\nbasicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\n",
  );
  await exec("openssl", [
    "req",
    "-new",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-sha256",
    "-days",
    "1",
    "-config",
    path.join(dir, "ca.cnf"),
    "-keyout",
    path.join(dir, "edith-debug-ca.key.pem"),
    "-out",
    path.join(dir, "edith-debug-ca.cert.pem"),
  ]);
  return dir;
}
async function tunnel(port, hostname = "localhost") {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port,
      method: "CONNECT",
      path: `${hostname}:443`,
      agent: false,
    });
    req.on("connect", (res, socket, head) => {
      if (head.length) socket.unshift(head);
      resolve({ res, socket });
    });
    req.on("error", reject);
    req.end();
  });
}
async function inspectedRequest(port, ca, body = "hello", host = "localhost") {
  const { socket } = await tunnel(port);
  return new Promise((resolve, reject) => {
    const connection = tls.connect({
      socket,
      servername: "localhost",
      ...(ca ? { ca } : {}),
      ALPNProtocols: ["http/1.1"],
    });
    let response = "";
    connection.setTimeout(5000, () =>
      connection.destroy(Error("test TLS timeout")),
    );
    connection.on("error", reject);
    connection.on("secureConnect", () =>
      connection.write(
        `POST /submit?q=1 HTTP/1.1\r\nHost: ${host}\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`,
      ),
    );
    connection.on("data", (chunk) => (response += chunk));
    connection.on("end", () => resolve(response));
  });
}
test("exact-host allowlist rejects wildcard, IP and URL inputs", () => {
  assert.deepEqual(inspectionDomains(["API.example.com", "api.example.com"]), [
    "api.example.com",
  ]);
  for (const invalid of [
    "*.example.com",
    "127.0.0.1",
    "https://example.com",
    "example.com:443",
    "a\nb.com",
  ])
    assert.throws(() => inspectionDomains([invalid]));
});
test("real TLS interception captures POST bodies, validates certificates, binds authority and closes on stop", async () => {
  const dir = await fixture();
  let backend, proxy;
  try {
    const inspector = createHttpsInspector({ directory: dir });
    assert.equal((await inspector.status()).ready, true);
    const material = await inspector.certificate("localhost");
    assert.equal(await inspector.certificate("localhost"), material);
    const ca = await readFile(path.join(dir, "edith-debug-ca.cert.pem"));
    let received = 0;
    backend = https.createServer(
      { key: material.key, cert: material.cert },
      (req, res) => {
        received++;
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          res.writeHead(201, { "Content-Type": "text/plain" });
          res.end("received " + body);
        });
      },
    );
    backend.listen(0, "127.0.0.1");
    await once(backend, "listening");
    const secureRequest = (url, options, callback) =>
      https.request(
        new URL(
          `https://localhost:${backend.address().port}${url.pathname}${url.search}`,
        ),
        {
          ...options,
          ca,
          lookup: (_host, _options, cb) =>
            _options.all
              ? cb(null, [{ address: "127.0.0.1", family: 4 }])
              : cb(null, "127.0.0.1", 4),
        },
        callback,
      );
    proxy = createLocalProxy({
      inspector,
      secureRequest,
      dial: () =>
        net.connect({ host: "127.0.0.1", port: backend.address().port }),
    });
    const state = await proxy.start(0, {
      enabled: true,
      allHostnames: true,
      domains: [],
      excludedDomains: ["outside.example"],
    });
    const opaque = await tunnel(state.port, "outside.example");
    assert.equal(opaque.res.statusCode, 200);
    opaque.socket.destroy();
    assert.equal(proxy.snapshot().records[0].captureKind, "tunnel");
    const response = await inspectedRequest(state.port, ca);
    assert.match(
      response,
      /201 Created/,
      JSON.stringify(proxy.snapshot().records),
    );
    assert.match(response, /received hello/);
    const records = proxy
      .snapshot()
      .records.filter((r) => r.captureKind === "https");
    assert.equal(records.length, 1);
    assert.equal(records[0].captureKind, "https");
    assert.equal(records[0].method, "POST");
    assert.equal(records[0].url, "https://localhost/submit?q=1");
    assert.equal(records[0].requestBody, "hello");
    assert.equal(records[0].responseBody, "received hello");
    const wrong = await inspectedRequest(
      state.port,
      ca,
      "hello",
      "other.example",
    );
    assert.match(wrong, /400 Bad Request/);
    assert.equal(received, 1);
    await assert.rejects(inspectedRequest(state.port, null));
    assert.equal(received, 1);
    await proxy.stop();
    assert.equal(proxy.snapshot().activeConnections, 0);
    // Keep upstream verification enabled: a different default trust store must reject this test backend.
    proxy = createLocalProxy({
      inspector,
      secureRequest: (url, options, callback) =>
        https.request(
          new URL(`https://localhost:${backend.address().port}${url.pathname}`),
          {
            ...options,
            lookup: (_h, _o, cb) =>
              _o.all
                ? cb(null, [{ address: "127.0.0.1", family: 4 }])
                : cb(null, "127.0.0.1", 4),
          },
          callback,
        ),
    });
    const second = await proxy.start(0, {
      enabled: true,
      domains: ["localhost"],
    });
    const failed = await inspectedRequest(second.port, ca);
    assert.match(failed, /502 Bad Gateway/);
    assert.equal(proxy.snapshot().records[0].status, 502);
    assert.ok(proxy.snapshot().records[0].error);
  } finally {
    await proxy?.stop();
    if (backend) {
      backend.closeAllConnections();
      await new Promise((resolve) => backend.close(resolve));
    }
    await rm(dir, { recursive: true, force: true });
  }
});
test("HTTPS start fails closed without CA and concurrent starts share state", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "edith-no-ca-"));
  const inspector = createHttpsInspector({ directory: dir }),
    proxy = createLocalProxy({ inspector });
  try {
    await assert.rejects(
      proxy.start(0, { enabled: true, domains: ["localhost"] }),
    );
    assert.equal(proxy.snapshot().state, "stopped");
    const [a, b] = await Promise.all([proxy.start(0), proxy.start(0)]);
    assert.equal(a.port, b.port);
  } finally {
    await proxy.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test("all-host mode is explicit, respects exact exclusions and leaves IP tunnels opaque", () => {
  const settings = inspectionSettings({
    enabled: true,
    allHostnames: true,
    excludedDomains: ["private.example.com"],
  });
  assert.equal(shouldInspectHost("new.example.com", settings), true);
  assert.equal(shouldInspectHost("private.example.com", settings), false);
  assert.equal(shouldInspectHost("127.0.0.1", settings), false);
  assert.equal(
    shouldInspectHost(
      "new.example.com",
      inspectionSettings({ enabled: false, allHostnames: true }),
    ),
    false,
  );
  assert.throws(() =>
    inspectionSettings({ enabled: true, allHostnames: "true" }),
  );
  assert.throws(() => inspectionSettings({ enabled: true, domains: [] }));
  const selected = inspectionSettings({
    enabled: true,
    domains: ["one.example.com"],
  });
  assert.equal(shouldInspectHost("two.example.com", selected), false);
});
