import { workspacePolicy } from "./access-policy";
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
  inspection?: {
    enabled: boolean;
    domains: string[];
    allHostnames?: boolean;
    excludedDomains?: string[];
    ca: {
      ready: boolean;
      subject?: string;
      fingerprint256?: string;
      validTo?: string;
      error?: string;
    };
  };
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
  controls.innerHTML = `
  <div class="wb-proxy-heading"><div><strong>Live local proxy</strong><span>Route traffic through your machine and inspect it here.</span></div><span class="proxy-runtime-badge" data-proxy="runtime-badge">Checking…</span><button class="wb-primary" data-proxy="start">Start proxy</button><button data-proxy="stop" disabled>Stop</button></div>
  <details class="proxy-settings-shell"><summary><span>Proxy settings</span><small>Connection · HTTPS · Certificate</small></summary>
    <div class="proxy-connection-card"><div class="proxy-settings-title"><span class="proxy-step">01</span><div><h3>Connection</h3><p>Use this address for both HTTP and HTTPS proxy settings.</p></div></div><div class="proxy-connection-fields"><label>Listen address<div class="proxy-address-input"><span>127.0.0.1 :</span><input data-proxy="port" type="number" min="1024" max="65535" value="8899" aria-label="Local proxy port"></div></label><code data-proxy="address">127.0.0.1:8899</code><span data-proxy="state" role="status">Checking local proxy service…</span></div><details class="proxy-example"><summary>Example request</summary><pre data-proxy="command">curl --noproxy '' -x http://127.0.0.1:8899 http://example.com</pre></details></div>
    <div class="proxy-settings-grid">
      <section class="proxy-inspection-card"><div class="proxy-settings-title"><span class="proxy-step">02</span><div><h3>HTTPS inspection</h3><p>Choose which encrypted connections to inspect.</p></div><small data-proxy="tls-state" class="proxy-setting-chip">Off</small></div>
        <label class="proxy-option-row"><span><strong>Enable inspection</strong><small>Requires a trusted local CA on the client.</small></span><input data-proxy="tls-enabled" type="checkbox" role="switch"></label>
        <label class="proxy-option-row"><span><strong>All hostnames</strong><small>Inspect all DNS hosts on port 443.</small></span><input data-proxy="tls-all" type="checkbox" role="switch"></label>
        <div class="proxy-domain-fields"><label class="proxy-tls-domains" data-proxy="domain-label">Selected hostnames<textarea data-proxy="tls-domains" rows="3" placeholder="api.example.com&#10;staging.example.com" spellcheck="false"></textarea><small>Exact DNS names, one per line. No https:// or paths.</small></label><label class="proxy-tls-domains">Excluded hostnames<textarea data-proxy="tls-excluded" rows="2" placeholder="private.example.com" spellcheck="false"></textarea><small>Excluded hosts always remain encrypted tunnels.</small></label></div>
        <p class="proxy-privacy-note">All-host mode may expose credentials and private traffic from background apps. HTTP/1.1 only; pinned certificates may reject inspection.</p>
      </section>
      <section class="proxy-certificate-card"><div class="proxy-settings-title"><span class="proxy-step">03</span><div><h3>Local certificate</h3><p>Your machine’s development certificate authority.</p></div></div>
        <p data-proxy="ca-state" class="proxy-ca-status" role="status">Checking CA…</p><dl class="proxy-ca-metadata"><dt>SHA-256 fingerprint</dt><dd data-proxy="ca-fingerprint">—</dd><dt>Expires</dt><dd data-proxy="ca-expiry">—</dd></dl>
        <div class="proxy-ca-actions"><button data-proxy="ca-create">Create local CA</button><a data-proxy="ca-download" href="/__edith_proxy/ca" download="edith-debug-ca.cert.pem">Download public CA</a></div>
        <details class="proxy-trust-guide"><summary>Trust on macOS</summary><ol><li>Download the public CA and import into the login keychain.</li><li>Verify its SHA-256 fingerprint above.</li><li>Open Trust → Secure Sockets Layer (SSL) → Always Trust.</li><li>Close the window and confirm with your Mac password.</li></ol><p>Trust is configured manually and cannot be detected here. Remove trust when finished. Never share the private key.</p></details>
      </section>
    </div><div class="proxy-settings-footer">Settings apply on Start. Stop the proxy to edit. EDITH does not change system proxy or certificate trust settings.</div>
  </details>`;
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
    const timeout = setTimeout(
      () => controller.abort(),
      path === "ca/create" ? 60000 : 5000,
    );
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
    controls.dataset.state = status.state;
    element("runtime-badge").textContent =
      status.state === "running"
        ? "Running"
        : status.state === "stopped"
          ? "Stopped"
          : status.state;
    const running = status.state === "running";
    element<HTMLButtonElement>("start").disabled = running || busy;
    element<HTMLButtonElement>("stop").disabled = !running || busy;
    element<HTMLInputElement>("tls-enabled").disabled =
      running || busy || !workspacePolicy.manageConnections;
    element<HTMLTextAreaElement>("tls-domains").disabled =
      running ||
      busy ||
      !workspacePolicy.manageConnections ||
      element<HTMLInputElement>("tls-all").checked;
    element<HTMLInputElement>("tls-all").disabled =
      running || busy || !workspacePolicy.manageConnections;
    element<HTMLTextAreaElement>("tls-excluded").disabled =
      running || busy || !workspacePolicy.manageConnections;

    element<HTMLButtonElement>("ca-create").disabled =
      running ||
      busy ||
      workspacePolicy.role !== "admin" ||
      !!status.inspection?.ca.ready;
    element("tls-state").textContent = status.inspection?.enabled
      ? status.inspection.allHostnames
        ? "Enabled · ALL hostnames"
        : "Enabled · selected domains"
      : "Off";
    if (running) {
      element<HTMLInputElement>("tls-all").checked =
        !!status.inspection?.allHostnames;
      element<HTMLTextAreaElement>("tls-excluded").value =
        status.inspection?.excludedDomains?.join("\n") || "";
      element<HTMLInputElement>("tls-enabled").checked =
        !!status.inspection?.enabled;
      element<HTMLTextAreaElement>("tls-domains").value =
        status.inspection?.domains.join("\n") || "";
    }
    const ca = status.inspection?.ca;
    element("ca-state").textContent = ca?.ready
      ? "CA ready · client trust must be set manually"
      : ca?.error || "CA service unavailable";
    element("ca-fingerprint").textContent = ca?.fingerprint256 || "—";
    element("ca-expiry").textContent = ca?.validTo || "—";
    element("ca-state").classList.toggle("is-ready", !!ca?.ready);
    element("domain-label").classList.toggle(
      "is-inactive",
      element<HTMLInputElement>("tls-all").checked,
    );
    element<HTMLAnchorElement>("ca-download").hidden = !ca?.ready;

    element<HTMLInputElement>("port").disabled = running || busy;
    if (status.token) token = status.token;
    if (status.port) {
      element<HTMLInputElement>("port").value = String(status.port);
      element("address").textContent = `127.0.0.1:${status.port}`;
      element("command").textContent =
        `curl --noproxy '' -x http://127.0.0.1:${status.port} http://example.com`;
    }
    element("state").textContent = running
      ? `Listening · ${status.total} captured · ${status.inspection?.enabled ? "HTTPS inspection enabled" : "HTTPS tunnels only"} · ${status.evicted} evicted`
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
      const result = await api(
        start ? "start" : "stop",
        start
          ? {
              port,
              inspection: {
                enabled: element<HTMLInputElement>("tls-enabled").checked,
                allHostnames: element<HTMLInputElement>("tls-all").checked,
                excludedDomains: element<HTMLTextAreaElement>("tls-excluded")
                  .value.split(/[\s,]+/)
                  .filter(Boolean),
                domains: element<HTMLTextAreaElement>("tls-domains")
                  .value.split(/[\s,]+/)
                  .filter(Boolean),
              },
            }
          : {},
      );
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
  element("ca-create").onclick = async () => {
    if (busy || workspacePolicy.role !== "admin") return;
    busy = true;
    try {
      const status = await api("status");
      token = status.token || "";
      await api("ca/create", {});
      hooks.notify(
        "CA created locally. Download and install trust manually only when needed.",
      );
    } catch (error) {
      hooks.notify(
        error instanceof Error ? error.message : "CA creation failed",
      );
    } finally {
      busy = false;
      void poll();
    }
  };
  element("tls-all").onchange = () => {
    element("domain-label").classList.toggle(
      "is-inactive",
      element<HTMLInputElement>("tls-all").checked,
    );
    element<HTMLTextAreaElement>("tls-domains").disabled =
      element<HTMLInputElement>("tls-all").checked;
  };
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
