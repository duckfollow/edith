import { prependIcon } from "./icons";
import type { HttpEntry } from "./debug-model";
interface ProxyStatus {
  state: "stopped" | "starting" | "running" | "stopping";
  port: number | null;
  sessionId: string;
  total: number;
  evicted: number;
  lastId: number;
  oldestId: number;
  activeConnections: number;
  records: HttpEntry[];
  token?: string;
}
interface Hooks {
  reset: () => void;
  entries: (records: HttpEntry[]) => void;
  status: (status: ProxyStatus) => void;
  notify: (message: string) => void;
}
export function mountLiveProxy(section: HTMLElement, hooks: Hooks) {
  const controls = document.createElement("div");
  controls.className = "wb-proxy-panel";
  controls.innerHTML = `<div class="wb-proxy-heading"><div><strong>Live local proxy</strong><span>HTTP inspection · HTTPS tunnel metadata · no certificate installation</span></div><button class="wb-primary" data-proxy="start">Start proxy</button><button data-proxy="stop" disabled>Stop</button></div><div class="wb-proxy-settings"><label>Port <input data-proxy="port" type="number" min="1024" max="65535" value="8899" aria-label="Local proxy port"></label><span data-proxy="state" role="status">Checking local proxy service…</span></div><p>Configure your app's HTTP/HTTPS proxy to <code data-proxy="address">127.0.0.1:8899</code>. Only traffic routed through this proxy appears here. System settings are unchanged.</p><pre data-proxy="command">curl --noproxy '' -x http://127.0.0.1:8899 http://example.com</pre>`;
  section.querySelector(".wb-source")!.before(controls);
  function element<T extends HTMLElement = HTMLElement>(name: string) {
    return controls.querySelector<T>(`[data-proxy="${name}"]`)!;
  }
  prependIcon(element("start"), "play");
  prependIcon(element("stop"), "stop");
  let token = "",
    cursor = 0,
    session = "",
    observed: ProxyStatus | null = null,
    busy = false,
    disposed = false,
    liveViewing = false,
    floor = 0;
  let abort: AbortController | undefined;
  async function api(path: string, body?: unknown): Promise<ProxyStatus> {
    const controller = new AbortController();
    abort = controller;
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`/__edith_proxy/${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers:
          body === undefined
            ? {}
            : { "Content-Type": "application/json", "X-Edith-Token": token },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.headers.get("content-type")?.includes("application/json"))
        throw new Error(
          "Local proxy service is available in the Vite development workspace. Packaged desktop support is not bundled yet.",
        );
      const value = await response.json();
      if (!response.ok)
        throw new Error(value.error || "Proxy service request failed");
      return value as ProxyStatus;
    } finally {
      clearTimeout(timeout);
      if (abort === controller) abort = undefined;
    }
  }
  function update(status: ProxyStatus) {
    observed = status;
    const running = status.state === "running";
    element<HTMLButtonElement>("start").disabled = running || busy;
    element<HTMLButtonElement>("stop").disabled = !running || busy;
    element<HTMLInputElement>("port").disabled = running || busy;
    if (status.token) token = status.token;
    if (status.port) {
      element<HTMLInputElement>("port").value = String(status.port);
      element("address").textContent = `127.0.0.1:${status.port}`;
      element("command").textContent =
        `curl --noproxy '' -x http://127.0.0.1:${status.port} http://example.com`;
    }
    element("state").textContent = running
      ? `Listening · ${status.total} captured · ${status.evicted} evicted from service buffer`
      : "Stopped · no traffic is being proxied";
    if (liveViewing) hooks.status(status);
  }
  async function poll() {
    if (busy || disposed) return;
    busy = true;
    let failure = "";
    try {
      const status = await api("status");
      if (disposed) return;
      if (status.state === "running" && status.sessionId !== session) {
        session = status.sessionId;
        cursor = floor = 0;
        liveViewing = true;
        hooks.reset();
      }
      update(status);
      if (liveViewing) {
        for (let batch = 0; batch < 4; batch++) {
          const events = await api(`events?after=${cursor}`);
          if (disposed) return;
          if (events.sessionId !== session) break;
          const incoming = events.records.filter((entry) => entry.id > floor);
          if (events.records.length)
            cursor = Math.max(
              cursor,
              events.records[events.records.length - 1].id,
            );
          if (incoming.length) hooks.entries(incoming);
          update(events);
          if (!events.records.length || cursor >= events.lastId) break;
        }
      }
    } catch (error) {
      if (!disposed) {
        failure = error instanceof Error ? error.message : String(error);
        element("state").textContent = failure;
        element<HTMLButtonElement>("start").disabled = false;
        element<HTMLButtonElement>("stop").disabled = false;
      }
    } finally {
      busy = false;
      if (observed) update(observed);
      if (failure) element("state").textContent = failure;
    }
  }
  async function change(start: boolean) {
    if (busy) return;
    const port = Number(element<HTMLInputElement>("port").value);
    if (start && (!Number.isInteger(port) || port < 1024 || port > 65535)) {
      hooks.notify("Choose a port between 1024 and 65535.");
      return;
    }
    busy = true;
    let failed = false;
    try {
      const status = await api("status");
      token = status.token || "";
      const result = await api(start ? "start" : "stop", start ? { port } : {});
      if (start) {
        session = result.sessionId;
        cursor = floor = 0;
        liveViewing = true;
        hooks.reset();
      }
      update(result);
    } catch (error) {
      failed = true;
      hooks.notify(error instanceof Error ? error.message : String(error));
    } finally {
      busy = false;
      if (observed) update(observed);
      if (!failed) void poll();
    }
  }
  element("start").onclick = () => void change(true);
  element("stop").onclick = () => void change(false);
  const interval = setInterval(() => void poll(), 1000);
  void poll();
  window.addEventListener("beforeunload", () => {
    disposed = true;
    clearInterval(interval);
    abort?.abort();
  });
  return {
    isRunning: () => observed?.state === "running",
    leaveLive: () => {
      liveViewing = false;
    },
    clearView: () => {
      floor = observed?.lastId ?? cursor;
      cursor = Math.max(cursor, floor);
    },
    isViewing: () => liveViewing,
  };
}
