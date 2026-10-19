import { test } from "node:test";
import assert from "node:assert/strict";
import {
  demoHar,
  demoLogs,
  displayHeaders,
  maskedUrl,
  matchesHttp,
  MAX_RECORDS,
  parseHar,
  parseLogs,
  parseStorage,
  updateStorage,
} from "./debug-model.ts";
test("HAR parsing retains request/response bodies and filters combined status/method/query", () => {
  const requests = parseHar(demoHar());
  assert.equal(requests.length, 5);
  const checkout = requests.find((r) => r.status === 504)!;
  assert.ok(checkout.requestBody.includes("productId"));
  assert.ok(checkout.responseBody.includes("Gateway timeout"));
  assert.equal(matchesHttp(checkout, "CHECKOUT", "5xx", "POST"), true);
  assert.equal(matchesHttp(checkout, "checkout", "2xx", "POST"), false);
  assert.equal(matchesHttp(checkout, "checkout", "all", "GET"), false);
  assert.equal(checkout.timings.wait, 5009);
});
test("malformed HAR and oversized entry lists fail rather than silently loading", () => {
  assert.throws(() => parseHar("{}"), /log.entries/);
  assert.throws(() => parseHar("{"));
  assert.throws(
    () =>
      parseHar(
        JSON.stringify({ log: { entries: [{ request: { url: "x" } }] } }),
      ),
    /response/,
  );
  assert.throws(
    () =>
      parseHar(
        JSON.stringify({ log: { entries: Array(MAX_RECORDS + 1).fill(null) } }),
      ),
    /limited/,
  );
});
test("credentials are masked by default without changing imported data", () => {
  const headers = [
    { name: "Authorization", value: "Bearer private" },
    { name: "Set-Cookie", value: "session=secret" },
    { name: "Accept", value: "application/json" },
  ];
  const masked = displayHeaders(headers, false);
  assert.ok(masked[0].value.includes("hidden"));
  assert.ok(masked[1].value.includes("hidden"));
  assert.equal(masked[2].value, "application/json");
  assert.equal(headers[0].value, "Bearer private");
  assert.equal(displayHeaders(headers, true)[0].value, "Bearer private");
  const url = maskedUrl(
    "https://user:pass@example.test/path?token=private&query=hello",
    false,
  );
  assert.ok(!url.includes("private"));
  assert.ok(!url.includes("user:pass"));
  assert.ok(url.includes("query=hello"));
});
test("log reader accepts JSONL, numeric Pino levels, unstructured and invalid JSON lines", () => {
  assert.equal(
    parseLogs(demoLogs).filter((l) => l.level === "ERROR").length,
    1,
  );
  const logs = parseLogs(
    '{"level":50,"time":0,"msg":"fail"}\nWARNING timeout\n{bad json\n',
  );
  assert.equal(logs[0].level, "ERROR");
  assert.equal(logs[0].timestamp, "1970-01-01T00:00:00.000Z");
  assert.equal(logs[1].level, "WARN");
  assert.equal(logs[2].raw, "{bad json");
  assert.throws(
    () =>
      parseLogs(
        Array(MAX_RECORDS + 1)
          .fill("x")
          .join("\n"),
      ),
    /limited/,
  );
});
test("storage edits validate JSON, preserve original state and keep special keys as own properties", () => {
  const original = parseStorage('{"theme":"dark","__proto__":{"test":true}}');
  const updated = updateStorage(original, "theme", '{"mode":"light"}');
  assert.equal(original.theme, "dark");
  assert.deepEqual(updated.theme, { mode: "light" });
  assert.equal(Object.getPrototypeOf(updated), Object.prototype);
  assert.ok(Object.prototype.hasOwnProperty.call(updated, "__proto__"));
  assert.throws(() => updateStorage(original, "theme", "invalid"));
  assert.throws(() => updateStorage(original, "missing", "true"), /existing/);
  assert.throws(() => parseStorage("[]"), /object/);
  assert.throws(() => parseStorage("null"), /object/);
});
