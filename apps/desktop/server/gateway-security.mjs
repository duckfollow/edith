export function validateSecurity(input) {
  if (input === undefined) return undefined;
  if (!input || typeof input.enabled !== "boolean")
    throw Error("Invalid Security configuration");
  if (
    !Array.isArray(input.allowedMethods) ||
    input.allowedMethods.length < 1 ||
    input.allowedMethods.length > 32 ||
    !input.allowedMethods.every(
      (m) => typeof m === "string" && /^[A-Z]{1,20}$/.test(m),
    )
  )
    throw Error("Select at least one valid HTTP method");
  if (
    !Number.isInteger(input.maxBodyBytes) ||
    input.maxBodyBytes < 0 ||
    input.maxBodyBytes > 16 * 1024 * 1024
  )
    throw Error("Body limit must be 0–16 MiB");
  if (
    !Number.isInteger(input.requestsPerMinute) ||
    input.requestsPerMinute < 1 ||
    input.requestsPerMinute > 100000
  )
    throw Error("Rate limit must be 1–100000 requests per minute");
  return {
    enabled: input.enabled,
    allowedMethods: [...new Set(input.allowedMethods)],
    maxBodyBytes: input.maxBodyBytes,
    requestsPerMinute: input.requestsPerMinute,
  };
}
export function createRateLimiter(limit, now = Date.now) {
  const peers = new Map();
  return (ip) => {
    const timestamp = now();
    for (const [key, value] of peers)
      if (timestamp - value.start >= 60000) peers.delete(key);
    let state = peers.get(ip);
    if (!state) {
      if (peers.size >= 1024) return false;
      state = { start: timestamp, count: 0 };
      peers.set(ip, state);
    }
    return ++state.count <= limit;
  };
}
export function readLimitedBody(req, limit, onChunk) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    function clean() {
      req.off("data", data);
      req.off("end", end);
      req.off("aborted", aborted);
      req.off("error", error);
    }
    function data(chunk) {
      size += chunk.length;
      onChunk(chunk);
      if (size > limit) {
        clean();
        req.pause();
        reject(
          Object.assign(Error("Security: request body exceeds limit"), {
            status: 413,
          }),
        );
        return;
      }
      chunks.push(chunk);
    }
    function end() {
      clean();
      resolve(Buffer.concat(chunks));
    }
    function aborted() {
      clean();
      reject(Error("Security: incomplete request body"));
    }
    function error() {
      aborted();
    }
    req.on("data", data);
    req.once("end", end);
    req.once("aborted", aborted);
    req.once("error", error);
  });
}
