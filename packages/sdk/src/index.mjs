const SECRET =
  /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-auth-token)$/i;
function clip(value, limit = 4096) {
  return String(value).slice(0, limit);
}
function safe(value) {
  if (value instanceof Error) return clip(value.stack || value.message, 12000);
  if (typeof value === "string") return clip(value);
  try {
    return clip(JSON.stringify(value));
  } catch {
    return "[Unserializable value]";
  }
}
function redactUrl(value) {
  try {
    const url = new URL(value, globalThis.location?.href);
    if (url.username) url.username = "redacted";
    if (url.password) url.password = "redacted";
    for (const key of [...url.searchParams.keys()])
      if (/token|secret|password|api[-_]?key|authorization|code/i.test(key))
        url.searchParams.set(key, "[redacted]");
    return url.toString();
  } catch {
    return clip(value);
  }
}
function headers(value) {
  try {
    return [...new Headers(value)].map(([name, value]) => ({
      name,
      value: SECRET.test(name) ? "[redacted]" : clip(value),
    }));
  } catch {
    return [];
  }
}
async function responsePreview(response) {
  if (
    !response.body ||
    !/text|json|xml|javascript|urlencoded/i.test(
      response.headers.get("content-type") || "",
    )
  )
    return { text: "", truncated: false };
  const reader = response.clone().body.getReader();
  let length = 0,
    truncated = false;
  const chunks = [];
  const deadline = Date.now() + 500;
  try {
    while (length < 4096) {
      if (Date.now() >= deadline) throw new Error("Preview timed out");
      let timeout;
      const { done, value } = await Promise.race([
        reader.read(),
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("Preview timed out")),
            Math.max(1, deadline - Date.now()),
          );
        }),
      ]).finally(() => clearTimeout(timeout));
      if (done) break;
      const keep = Math.min(value.length, 4096 - length);
      chunks.push(value.slice(0, keep));
      length += keep;
      if (keep < value.length || length === 4096) {
        truncated = true;
        break;
      }
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
  const data = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  return { text: new TextDecoder().decode(data), truncated };
}
export function createEdith(options = {}) {
  const enabled = options.enabled === true;
  const originalFetch = globalThis.fetch;
  if (enabled && typeof originalFetch !== "function")
    throw new Error("EDITH SDK requires a fetch implementation.");
  const endpoint =
    options.endpoint || "http://127.0.0.1:1420/__edith_sdk/events";
  if (enabled) {
    const url = new URL(endpoint);
    if (
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      url.protocol !== "http:"
    )
      throw new Error(
        "EDITH SDK endpoint must be HTTP loopback in this release.",
      );
    if (!options.token)
      throw new Error("Enable SDK in EDITH and provide its pairing token.");
  }
  const identity = {
    appId: clip(options.appId || options.appName || "javascript-app", 80),
    appName: clip(options.appName || "JavaScript app", 80),
    instanceId:
      globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
  };
  let queue = [],
    timer = null,
    inFlight = null,
    disposed = false,
    sent = 0,
    dropped = 0,
    lastError = "",
    installed = false,
    fetchWrapper = null;
  const restores = [];
  const previews = new Set();
  function schedule() {
    if (!enabled || disposed || timer) return;
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, 100);
    timer.unref?.();
  }
  function emit(type, data) {
    if (!enabled || disposed) return;
    if (queue.length >= 100) {
      queue.shift();
      dropped++;
    }
    queue.push({ type, timestamp: new Date().toISOString(), data });
    schedule();
  }
  async function flush() {
    if (!enabled || disposed) return status();
    if (inFlight) return inFlight;
    if (previews.size) await Promise.allSettled([...previews]);
    if (inFlight) return inFlight;
    clearTimeout(timer);
    timer = null;
    inFlight = (async () => {
      let batches = 0;
      while (queue.length && batches++ < 10 && !disposed) {
        const batch = queue.splice(0, 10);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        try {
          const response = await originalFetch.call(globalThis, endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${options.token}`,
            },
            body: JSON.stringify({ version: 1, ...identity, events: batch }),
            signal: controller.signal,
          });
          if (!response.ok)
            throw new Error(`EDITH receiver returned ${response.status}`);
          sent += batch.length;
          lastError = "";
          void response.body?.cancel().catch(() => {});
        } catch (error) {
          dropped += batch.length;
          lastError = safe(error);
        } finally {
          clearTimeout(timeout);
        }
      }
      return status();
    })();
    try {
      return await inFlight;
    } finally {
      inFlight = null;
      if (queue.length) schedule();
    }
  }
  function status() {
    return {
      enabled: enabled && !disposed,
      pending: queue.length,
      sent,
      dropped,
      lastError,
    };
  }
  async function instrumentedFetch(input, init) {
    if (!enabled || disposed)
      return originalFetch.call(globalThis, input, init);
    const raw =
      typeof input === "string" || input instanceof URL
        ? String(input)
        : input.url;
    if (raw.startsWith(endpoint))
      return originalFetch.call(globalThis, input, init);
    const started = performance.now();
    const timestamp = new Date().toISOString();
    const request = {
      method: clip(
        init?.method ||
          (typeof input === "object" && "method" in input
            ? input.method
            : "GET"),
        20,
      ),
      url: redactUrl(raw),
      requestHeaders: headers(
        init?.headers ||
          (typeof input === "object" && "headers" in input
            ? input.headers
            : undefined),
      ),
      requestBody:
        options.captureBodies && typeof init?.body === "string"
          ? clip(init.body)
          : "",
      requestTruncated: !!(
        options.captureBodies &&
        typeof init?.body === "string" &&
        init.body.length > 4096
      ),
    };
    try {
      const response = await originalFetch.call(globalThis, input, init);
      const duration = performance.now() - started;
      const report = async () => {
        try {
          const body = options.captureBodies
            ? await responsePreview(response)
            : { text: "", truncated: false };
          emit("network", {
            ...request,
            timestamp,
            status: response.status,
            duration,
            size: Number(response.headers.get("content-length")) || 0,
            responseHeaders: headers(response.headers),
            responseBody: body.text,
            responseTruncated: body.truncated,
            mimeType: response.headers.get("content-type") || "",
            error: "",
          });
        } catch (error) {
          emit("network", {
            ...request,
            timestamp,
            status: response.status,
            duration,
            size: 0,
            responseHeaders: headers(response.headers),
            responseBody: "",
            error: `Body preview unavailable: ${safe(error)}`,
          });
        }
      };
      // Report in the background; never delay delivery of the response to the app.
      if (previews.size < 16) {
        const pending = report();
        previews.add(pending);
        void pending.finally(() => previews.delete(pending));
      } else dropped++;
      return response;
    } catch (error) {
      emit("network", {
        ...request,
        timestamp,
        status: 0,
        duration: performance.now() - started,
        size: 0,
        responseHeaders: [],
        responseBody: "",
        mimeType: "",
        error: safe(error),
      });
      throw error;
    }
  }
  function log(level, ...values) {
    emit("log", {
      level: clip(level, 20).toUpperCase(),
      message: clip(values.map(safe).join(" "), 12000),
    });
  }
  function captureError(error) {
    emit("error", {
      message: error instanceof Error ? clip(error.message) : safe(error),
      stack: error instanceof Error ? clip(error.stack || "", 12000) : "",
    });
  }
  function install({ captureConsole = false, captureErrors = true } = {}) {
    if (!enabled || disposed || installed) return uninstall;
    installed = true;
    const previous = globalThis.fetch;
    fetchWrapper = (...args) => instrumentedFetch(...args);
    globalThis.fetch = fetchWrapper;
    restores.push(() => {
      if (globalThis.fetch === fetchWrapper) globalThis.fetch = previous;
    });
    if (captureConsole)
      for (const level of ["debug", "info", "log", "warn", "error"]) {
        const previous = console[level];
        const wrapper = function (...args) {
          previous.apply(console, args);
          log(level === "log" ? "INFO" : level, ...args);
        };
        console[level] = wrapper;
        restores.push(() => {
          if (console[level] === wrapper) console[level] = previous;
        });
      }
    if (captureErrors && typeof globalThis.addEventListener === "function") {
      const onError = (event) => captureError(event.error || event.message);
      const onRejection = (event) => captureError(event.reason);
      globalThis.addEventListener("error", onError);
      globalThis.addEventListener("unhandledrejection", onRejection);
      restores.push(() => {
        globalThis.removeEventListener("error", onError);
        globalThis.removeEventListener("unhandledrejection", onRejection);
      });
    }
    return uninstall;
  }
  function uninstall() {
    while (restores.length) restores.pop()();
    installed = false;
  }
  function dispose() {
    uninstall();
    disposed = true;
    clearTimeout(timer);
    clearInterval(heartbeat);
    queue = [];
  }
  emit("heartbeat", {});
  const heartbeat = enabled
    ? setInterval(() => emit("heartbeat", {}), 10000)
    : null;
  heartbeat?.unref?.();
  return {
    fetch: instrumentedFetch,
    log,
    captureError,
    install,
    uninstall,
    flush,
    status,
    dispose,
  };
}
