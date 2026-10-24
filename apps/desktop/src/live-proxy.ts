import { mountCertificateSetup } from "./certificate-setup";
import { mountSystemProxy } from "./system-proxy";
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
  <details class="proxy-settings-shell" open><summary><span>Proxy settings</span><small>Configure your connection</small></summary>
  <div class="proxy-settings-layout"><nav class="proxy-settings-nav" role="tablist" aria-label="Proxy settings"><button type="button" role="tab" id="proxy-tab-connection" aria-controls="proxy-pane-connection" aria-selected="true" data-proxy-tab="connection"><strong>Connection</strong><small>Address &amp; system routing</small></button><button type="button" role="tab" id="proxy-tab-inspection" aria-controls="proxy-pane-inspection" aria-selected="false" tabindex="-1" data-proxy-tab="inspection"><strong>HTTPS inspection</strong><small>Domains &amp; exclusions</small></button><button type="button" role="tab" id="proxy-tab-certificate" aria-controls="proxy-pane-certificate" aria-selected="false" tabindex="-1" data-proxy-tab="certificate"><strong>Certificate</strong><small>Local CA &amp; trust</small></button></nav><div class="proxy-settings-content">
  <section id="proxy-pane-connection" role="tabpanel" aria-labelledby="proxy-tab-connection" tabindex="0" data-proxy-pane="connection">
    <div class="proxy-connection-card"><div class="proxy-settings-title"><div><h3>Connection</h3><p>Choose where EDITH listens for incoming traffic.</p></div></div><div class="proxy-connection-fields"><label>Listen address<div class="proxy-address-input"><span>127.0.0.1 :</span><input data-proxy="port" type="number" min="1024" max="65535" value="8899" aria-label="Local proxy port"></div></label><code data-proxy="address">127.0.0.1:8899</code><span data-proxy="state" role="status">Checking local proxy service…</span></div><details class="proxy-example"><summary>Example request</summary><pre data-proxy="command">curl --noproxy '' -x http://127.0.0.1:8899 http://example.com</pre></details></div>
    <div data-system-proxy-slot></div></section>
    <div id="proxy-pane-inspection" role="tabpanel" aria-labelledby="proxy-tab-inspection" tabindex="0" data-proxy-pane="inspection" hidden>
      <section class="proxy-inspection-card"><div class="proxy-settings-title"><div><h3>HTTPS inspection</h3><p>Choose which encrypted connections to inspect. Settings are remembered on this device and apply on Start.</p></div><small data-proxy="tls-state" class="proxy-setting-chip">Off</small></div>
        <label class="proxy-option-row"><span><strong>Enable inspection</strong><small>Requires a trusted local CA on the client.</small></span><span class="proxy-toggle-control"><input data-proxy="tls-enabled" type="checkbox" role="switch"><span aria-hidden="true"></span></span></label>
        <label class="proxy-option-row"><span><strong>All hostnames</strong><small>Inspect all DNS hosts on port 443.</small></span><span class="proxy-toggle-control"><input data-proxy="tls-all" type="checkbox" role="switch"><span aria-hidden="true"></span></span></label>
        <div class="proxy-domain-fields"><label class="proxy-tls-domains" data-proxy="domain-label">Selected hostnames<textarea data-proxy="tls-domains" rows="3" placeholder="api.example.com&#10;staging.example.com" spellcheck="false"></textarea><small>Exact DNS names, one per line. No https:// or paths.</small></label><label class="proxy-tls-domains">Excluded hostnames<textarea data-proxy="tls-excluded" rows="2" placeholder="private.example.com" spellcheck="false"></textarea><small>Excluded hosts always remain encrypted tunnels.</small></label></div>
        <p class="proxy-privacy-note">All-host mode may expose credentials and private traffic from background apps. HTTP/1.1 only; pinned certificates may reject inspection.</p>
      </section>
      </div><div id="proxy-pane-certificate" role="tabpanel" aria-labelledby="proxy-tab-certificate" tabindex="0" data-proxy-pane="certificate" hidden><section class="proxy-certificate-card"><div class="proxy-settings-title"><div><h3>Local certificate</h3><p>Set up HTTPS inspection in three steps. Your private key stays on this machine.</p></div></div>
        <ol class="ca-setup-steps">
          <li><span class="ca-step-number">1</span><div><h4>Create your certificate</h4><p data-proxy="ca-state" class="proxy-ca-status" role="status">Checking CA…</p><button data-proxy="ca-create">Create certificate</button></div></li>
          <li><span class="ca-step-number">2</span><div><h4>Add to Keychain &amp; set trust</h4><p>Open the public certificate, add it to the <strong>login</strong> keychain, and compare its SHA-256 fingerprint.</p><div class="proxy-ca-actions"><button data-proxy="ca-open">Open in Keychain Access</button><button data-proxy="ca-copy">Copy fingerprint</button><a data-proxy="ca-download" href="/__edith_proxy/ca" download="edith-debug-ca.cert.pem">Download certificate</a></div><p data-proxy="ca-native-hint">In the browser or on other platforms, download the certificate and open your certificate manager manually.</p><details class="proxy-trust-guide" open><summary>How to trust on macOS</summary><ol><li>In Keychain Access, find <strong>EDITH</strong> in the login keychain and double-click the certificate.</li><li>Compare the SHA-256 fingerprint with Certificate details below.</li><li>Expand <strong>Trust</strong> and set <strong>Secure Sockets Layer (SSL)</strong> to <strong>Always Trust</strong>.</li><li>Close the certificate window and confirm with your Mac password.</li></ol></details></div></li>
          <li><span class="ca-step-number">3</span><div><h4>Check certificate trust <span data-proxy="ca-trust-state" class="ca-trust-badge">Not checked</span></h4><p>Check whether macOS accepts this CA for SSL. This does not test the full proxy connection.</p><button data-proxy="ca-verify">Check trust on this Mac</button></div></li>
        </ol>
        <p data-proxy="ca-feedback" class="ca-setup-feedback" role="status" aria-live="polite"></p>
        <details class="ca-certificate-details"><summary>Certificate details</summary><dl class="proxy-ca-metadata"><dt>SHA-256 fingerprint</dt><dd data-proxy="ca-fingerprint">—</dd><dt>Expires</dt><dd data-proxy="ca-expiry">—</dd></dl></details>
        <p class="ca-setup-note">Only trust your own development CA. Remove its trust when finished. Certificate trust is never changed automatically.</p>
      </section>
    </div></div></div><div class="proxy-settings-footer">Connection and inspection changes apply on Start. Stop the proxy to edit them.</div>
  </details>`;
  section.querySelector(".wb-source")!.before(controls);
  function element<T extends HTMLElement = HTMLElement>(name: string) {
    return controls.querySelector<T>(`[data-proxy="${name}"]`)!;
  }
  const settingsTabs = [...controls.querySelectorAll<HTMLButtonElement>("[data-proxy-tab]")];
  function selectSettingsTab(tab: HTMLButtonElement) {
    for (const item of settingsTabs) {
      item.setAttribute("aria-selected", String(item === tab));
      item.tabIndex = item === tab ? 0 : -1;
    }
    for (const pane of controls.querySelectorAll<HTMLElement>("[data-proxy-pane]")) {
      pane.hidden = pane.dataset.proxyPane !== tab.dataset.proxyTab;
    }
  }
  settingsTabs.forEach((tab, index) => {
    tab.onclick = () => selectSettingsTab(tab);
    tab.onkeydown = event => {
      const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? settingsTabs.length - 1
        : (index + (event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1) + settingsTabs.length) % settingsTabs.length;
      selectSettingsTab(settingsTabs[next]);
      settingsTabs[next].focus();
    };
  });
  const inspectionPreferenceKey = "edith-https-inspection-preferences-v1";
  function saveInspectionPreferences() {
    try {
      localStorage.setItem(inspectionPreferenceKey, JSON.stringify({
        enabled: element<HTMLInputElement>("tls-enabled").checked,
        allHostnames: element<HTMLInputElement>("tls-all").checked,
        domains: element<HTMLTextAreaElement>("tls-domains").value,
        excludedDomains: element<HTMLTextAreaElement>("tls-excluded").value,
      }));
    } catch { /* Keep working if storage is unavailable. */ }
  }
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(inspectionPreferenceKey) || "null");
    if (saved && typeof saved === "object") {
      const preferences = saved as Record<string, unknown>;
      element<HTMLInputElement>("tls-enabled").checked = preferences.enabled === true;
      element<HTMLInputElement>("tls-all").checked = preferences.allHostnames === true;
      if (typeof preferences.domains === "string") element<HTMLTextAreaElement>("tls-domains").value = preferences.domains;
      if (typeof preferences.excludedDomains === "string") element<HTMLTextAreaElement>("tls-excluded").value = preferences.excludedDomains;
    }
  } catch { /* Invalid saved settings fall back to inspection off. */ }
  prependIcon(element("start"), "play");
  prependIcon(element("stop"), "stop");
  let token = "",
    cursor = 0,
    session = "",
    observed: ProxyStatus | null = null,
    busy = false,
    polling = false,
    revision = 0,
    disposed = false,
    liveViewing = false,
    floor = 0;
  const systemProxy = mountSystemProxy(
    controls.querySelector("[data-system-proxy-slot]")!,
    () => observed?.state === "running" ? observed.port : null,
  );
  const certificateSetup = mountCertificateSetup(controls);
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
          "The local proxy service is unavailable. Restart EDITH or its development server.",
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
    element("tls-state").textContent = running
      ? status.inspection?.enabled ? "Inspecting HTTPS" : "Tunnels only"
      : element<HTMLInputElement>("tls-enabled").checked ? "Enabled on next Start" : "Off";
    const ca = status.inspection?.ca;
    element("ca-state").textContent = ca?.ready
      ? "Certificate created · continue to step 2"
      : ca?.error || "CA service unavailable";
    element("ca-fingerprint").textContent = ca?.fingerprint256 || "—";
    element("ca-expiry").textContent = ca?.validTo || "—";
    element("ca-state").classList.toggle("is-ready", !!ca?.ready);
    certificateSetup.update(ca);
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
    systemProxy.update();
    if (liveViewing) hooks.status(status);
  }
  async function poll() {
    if (busy || polling || disposed) return;
    polling = true;
    const pollRevision = revision;
    let failure = "";
    try {
      const status = await api("status");
      if (disposed || busy || pollRevision !== revision) return;
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
          if (disposed || busy || pollRevision !== revision) return;
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
      if (!disposed && !busy && pollRevision === revision) {
        failure = error instanceof Error ? error.message : String(error);
        element("state").textContent = failure;
        element<HTMLButtonElement>("start").disabled = false;
        element<HTMLButtonElement>("stop").disabled = false;
      }
    } finally {
      polling = false;
      if (!disposed && !busy && pollRevision === revision) {
        if (observed) update(observed);
        if (failure) element("state").textContent = failure;
      }
    }
  }
  async function change(start: boolean) {
    if (busy) return;
    const port = Number(element<HTMLInputElement>("port").value);
    if (start && (!Number.isInteger(port) || port < 1024 || port > 65535)) {
      hooks.notify("Choose a port between 1024 and 65535.");
      return;
    }
    if (start) saveInspectionPreferences();
    busy = true;
    revision++;
    if (observed) update(observed);
    let failed = false;
    try {
      const status = await api("status");
      token = status.token || "";
      if (!start) await systemProxy.beforeStop();
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
      if (start && result.state === "running") {
        try { await systemProxy.afterStart(); }
        catch (error) {
          hooks.notify(`Proxy is running, but System Proxy could not be enabled: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
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
    revision++;
    if (observed) update(observed);
    try {
      const status = await api("status");
      token = status.token || "";
      await api("ca/create", {});
      hooks.notify(
        "Certificate created. Continue to step 2 to add it to Keychain Access.",
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
    saveInspectionPreferences();
    element("domain-label").classList.toggle(
      "is-inactive",
      element<HTMLInputElement>("tls-all").checked,
    );
    element<HTMLTextAreaElement>("tls-domains").disabled =
      element<HTMLInputElement>("tls-all").checked;
  };
  element("tls-enabled").onchange = () => {
    saveInspectionPreferences();
    if (observed) update(observed);
  };
  for (const field of ["tls-domains", "tls-excluded"]) {
    element<HTMLTextAreaElement>(field).oninput = saveInspectionPreferences;
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
