import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { workspacePolicy } from "./access-policy";
type Setting = { enabled: boolean; server: string; port: number };
type Config = { service: string; http: Setting; https: Setting };
type Status = { supported: boolean; services: string[]; recovery: Config | null };
export function mountSystemProxy(root: HTMLElement, runningPort: () => number | null) {
  const panel = document.createElement("section");
  panel.className = "system-proxy-card";
  panel.innerHTML = `<div class="system-proxy-heading"><div><h3>System Proxy <span class="system-proxy-badge">Off</span></h3><p>Send this Mac’s web traffic through EDITH.</p></div><label class="system-proxy-switch"><input type="checkbox" role="switch" aria-label="Use EDITH as System Proxy" aria-describedby="system-proxy-help" disabled><span aria-hidden="true"></span></label></div><div class="system-proxy-toolbar"><label>Network<select aria-label="System proxy network service"></select></label><button type="button" data-system-proxy="refresh">Refresh status</button></div><label class="system-proxy-auto"><input type="checkbox" data-system-proxy="auto"><span><strong>Enable System Proxy on Start</strong><small>Restore previous settings when you stop.</small></span></label><p id="system-proxy-help" class="system-proxy-help"></p><details class="system-proxy-details"><summary>Connection details</summary><p role="status"></p><button type="button" data-system-proxy="restore" hidden>Restore saved settings</button></details>`;
  root.append(panel);
  const select = panel.querySelector("select")!;
  const toggle = panel.querySelector("input")!;
  const restore = panel.querySelector<HTMLButtonElement>('[data-system-proxy="restore"]')!;
  const refresh = panel.querySelector<HTMLButtonElement>('[data-system-proxy="refresh"]')!;
  const note = panel.querySelector("p[role]")!;
  const badge = panel.querySelector<HTMLElement>(".system-proxy-badge")!;
  const help = panel.querySelector<HTMLElement>(".system-proxy-help")!;
  const details = panel.querySelector<HTMLDetailsElement>("details")!;
  const native = isTauri();
  const auto = panel.querySelector<HTMLInputElement>('[data-system-proxy="auto"]')!;
  const preferenceKey = "edith-system-proxy-auto-start";
  const serviceKey = "edith-system-proxy-network-service";
  let savedService = "";
  auto.checked = true;
  try {
    auto.checked = localStorage.getItem(preferenceKey) !== "false";
    savedService = localStorage.getItem(serviceKey) || "";
  } catch { /* Preferences are optional when storage is unavailable. */ }
  auto.onchange = () => {
    try { localStorage.setItem(preferenceKey, String(auto.checked)); } catch { /* Keep session preference. */ }
    draw();
  };
  let ready: Promise<string> = Promise.resolve("");
  let state: Status | undefined;
  let busy = false;
  let current: Config | undefined;
  function draw() {
    const port = runningPort();
    toggle.checked = !!port && !!current && [current.http, current.https].every(s => s.enabled && s.server === "127.0.0.1" && s.port === port);
    toggle.disabled = busy || !state?.supported || !workspacePolicy.manageConnections || (!state.recovery && !port) || (!!state.recovery && !toggle.checked);
    select.disabled = busy || !!state?.recovery || !state?.supported;
    restore.hidden = !state?.recovery;
    restore.disabled = busy || !workspacePolicy.manageConnections;
    refresh.disabled = busy;
    auto.disabled = busy || !state?.supported || !workspacePolicy.manageConnections;
    badge.textContent = busy ? "Updating…" : !native || (state && !state.supported) ? "Desktop only" : toggle.checked ? "On" : state?.recovery ? "Restore available" : "Off";
    panel.dataset.active = String(toggle.checked);
    panel.setAttribute("aria-busy", String(busy));
    help.textContent = busy ? "Checking settings or waiting for macOS approval…"
      : !native || (state && !state.supported) ? "Available in EDITH desktop on macOS."
      : !workspacePolicy.manageConnections ? "Your role does not allow connection changes."
      : state?.recovery ? "Previous settings are saved. Switch off to restore them." 
      : !port ? auto.checked ? "Start proxy to connect this network automatically." : "Start the local proxy, then turn on this switch."
      : "Ready to connect. macOS may ask for administrator approval.";
    if (state?.recovery && !toggle.checked && !busy) {
      help.textContent = "Saved settings need restoring. Open Connection details to restore.";
      details.open = true;
    }
  }
  async function read() {
    state = await invoke<Status>("system_proxy_status");
    if (!state.supported) { note.textContent = "Available on macOS desktop only."; draw(); return; }
    const selected = state.recovery?.service || select.value || savedService;
    select.replaceChildren(...state.services.map(service => new Option(service, service)));
    if (state.recovery && !state.services.includes(state.recovery.service)) select.add(new Option(state.recovery.service, state.recovery.service));
    select.value = state.services.includes(selected) || state.recovery ? selected : state.services.includes("Wi-Fi") ? "Wi-Fi" : state.services[0] || "";
    current = select.value ? await invoke<Config>("system_proxy_read", { service: select.value }) : undefined;
    draw();
    const summary = (s: Setting) => s.enabled ? `${s.server}:${s.port}` : "Off";
    note.textContent = current ? `HTTP: ${summary(current.http)} · HTTPS: ${summary(current.https)}. ${state.recovery ? "Previous settings saved. Restore before quitting EDITH or stopping its development server." : "Start the local proxy to enable. macOS may ask for administrator approval."}` : "No available network service.";
  }
  async function task(operation: () => Promise<void>) {
    if (busy) return "Wait for the System Proxy operation to finish.";
    busy = true; draw();
    let error = "";
    try { await operation(); } catch (e) { error = String(e); }
    try { await read(); } catch (e) { error ||= String(e); }
    busy = false; draw();
    if (error) { note.textContent = error; details.open = true; help.textContent = "Could not update System Proxy. See details below."; }
    return error;
  }
  async function restoreSettings() {
    await invoke("system_proxy_change", { service: select.value, port: 0, enable: false });
  }
  toggle.onchange = () => {
    const enable = toggle.checked;
    void task(async () => {
      if (!workspacePolicy.manageConnections) throw Error("Connection management permission required.");
      if (!enable) return restoreSettings();
      const port = runningPort();
      if (!port) throw Error("Start the local proxy first.");
      await invoke("system_proxy_change", { service: select.value, port, enable: true });
    });
  };
  restore.onclick = () => void task(restoreSettings);
  select.onchange = () => {
    savedService = select.value;
    try { localStorage.setItem(serviceKey, savedService); } catch { /* Keep session preference. */ }
    void task(async () => {});
  };
  refresh.onclick = () => void task(async () => {});
  if (isTauri()) {
    ready = task(async () => {});
    void getCurrentWindow().onCloseRequested(async (event) => {
      // Tauri awaits this callback, then destroys the window if it is not
      // prevented. Calling close() here creates a second close event instead.
      if (busy) {
        event.preventDefault();
        note.textContent = "Wait for the System Proxy operation before closing.";
        window.dispatchEvent(new CustomEvent("edith-runtime-notice", { detail: note.textContent }));
        return;
      }
      busy = true; draw();
      try {
        const latest = await invoke<Status>("system_proxy_status");
        if (latest.recovery) await restoreSettings();
      } catch (e) {
        event.preventDefault();
        note.textContent = `Unable to restore System Proxy before closing: ${String(e)}`;
        details.open = true;
        window.dispatchEvent(new CustomEvent("edith-runtime-notice", { detail: note.textContent }));
      } finally { busy = false; draw(); }
    }).catch(e => { note.textContent = `Automatic close cleanup unavailable: ${String(e)}. Restore saved settings before closing.`; });
  }
  else {
    select.disabled = true; refresh.hidden = true; draw();
    note.textContent = "Open EDITH desktop on macOS to control System Proxy. In the browser, configure it in macOS Network settings.";
  }
  return {
    update: draw,
    afterStart: async () => {
      if (!native || !auto.checked || !workspacePolicy.manageConnections) return;
      const initializationError = await ready;
      if (initializationError) throw Error(initializationError);
      if (!state?.supported) return;
      const error = await task(async () => {
        await read();
        if (toggle.checked) return;
        if (state?.recovery) throw Error("Restore saved System Proxy settings before enabling automatically.");
        const port = runningPort();
        if (!port) throw Error("The local proxy is no longer running.");
        await invoke("system_proxy_change", { service: select.value, port, enable: true });
      });
      if (error) throw Error(error);
    },
    beforeStop: async () => {
      if (!isTauri()) return;
      if (busy) throw Error("Wait for the System Proxy operation to finish.");
      const latest = await invoke<Status>("system_proxy_status");
      if (latest.recovery) {
        await restoreSettings();
        await read();
      }
    },
  };
}
