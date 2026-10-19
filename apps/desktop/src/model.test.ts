import { test } from "node:test";
import assert from "node:assert/strict";
import { appendBounded, matches, samplePacket } from "./model.ts";
const packets = Array.from({ length: 12 }, (_, i) =>
  samplePacket(i + 1, "test"),
);
test("bounded buffer preserves newest packets and exact eviction count", () => {
  const result = appendBounded(packets.slice(0, 5), packets.slice(5), 4);
  assert.equal(result.evicted, 8);
  assert.deepEqual(
    result.packets.map((p) => p.id),
    [9, 10, 11, 12],
  );
  assert.equal(appendBounded([], [], 4).evicted, 0);
  assert.throws(() => appendBounded([], [], 0));
});
test("search composes with protocol and direction filters", () => {
  assert.equal(
    matches(packets[0], {
      query: " EXAMPLE.COM ",
      protocol: "DNS",
      direction: "outbound",
    }),
    true,
  );
  assert.equal(
    matches(packets[0], {
      query: "example.com",
      protocol: "TCP",
      direction: "all",
    }),
    false,
  );
  assert.equal(
    matches(packets[0], { query: "53", protocol: "all", direction: "inbound" }),
    false,
  );
  assert.equal(
    matches(packets[0], { query: "53", protocol: "all", direction: "all" }),
    true,
  );
});
test("sample records carry session identity and represent local and IPv6 traffic", () => {
  assert.ok(
    packets.every((p) => p.sessionId === "test" && p.interfaceId === "sample0"),
  );
  assert.ok(packets.some((p) => p.direction === "local"));
  assert.ok(packets.some((p) => p.sourceAddress.includes(":")));
});
