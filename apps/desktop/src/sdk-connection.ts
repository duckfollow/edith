import { prependIcon } from "./icons";
import type { HttpEntry, LogEntry } from "./debug-model";
interface App {
  key: string;
  appId: string;
  appName: string;
  instanceId: string;
  lastSeen: string;
}
interface SdkEvent {
  id: number;
  type: "network" | "log" | "error";
  appId: string;
  instanceId: string;
  data: HttpEntry | LogEntry;
}
interface SdkState {
  enabled: boolean;
  lastId: number;
  evicted: number;
  apps: App[];
  events: SdkEvent[];
  controlToken?: string;
  pairingToken?: string;
}
interface Hooks {
  selection: (app: App | null, events: SdkEvent[]) => void;
  events: (events: SdkEvent[]) => void;
  notify: (message: string) => void;
}
export function mountSdkConnection(root: HTMLElement, hooks: Hooks) {
  const panel = document.createElement("details");
  panel.className = "wb-sdk-panel";
  panel.innerHTML = `<summary>SDK connection <span>Connect your JavaScript app without a proxy</span></summary><div class="wb-sdk-controls"><button data-sdk="enable" class="wb-primary">Enable SDK receiver</button><button data-sdk="disable" disabled>Disable</button><span data-sdk="status" role="status">Checking receiver…</span></div><p>Opt in from your development app. Only instrumented fetch calls are reported; no system proxy or certificates are needed.</p><textarea data-sdk="snippet" aria-label="SDK setup snippet with pairing token" readonly spellcheck="false" hidden></textarea><p data-sdk="hint">Enable to generate a local pairing token. This development receiver is not bundled in desktop releases.</p>`;
  root.querySelector("#wb-content")!.before(panel);
  const target = root.querySelector(".wb-target")!;
  target.replaceChildren();
  const label = document.createElement("label");
  label.textContent = "DEBUG TARGET";
  const picker = document.createElement("select");
  picker.setAttribute("aria-label", "Debug target");
  target.append(label, picker);
  function el<T extends HTMLElement = HTMLElement>(name: string) {
    return panel.querySelector<T>(`[data-sdk="${name}"]`)!;
  }
  prependIcon(el("enable"), "plug");
  prependIcon(el("disable"), "unplug");
  let selected = "",
    cursor = 0,
    cache: SdkEvent[] = [],
    current: SdkState | null = null,
    busy = false,
    token = "",
    pairing = "",
    disposed = false,
    autoSelect = true;
  function apply(state: SdkState) {
    current = state;
    if (state.controlToken) token = state.controlToken;
    if (
      (state.pairingToken && state.pairingToken !== pairing) ||
      !state.enabled
    ) {
      cursor = 0;
      cache = [];
      if (selected) {
        selected = "";
        hooks.selection(null, []);
      }
    }
    pairing = state.pairingToken || pairing;
    const fragment = document.createDocumentFragment();
    const local = document.createElement("option");
    local.value = "";
    local.textContent = "Files / Local proxy";
    fragment.append(local);
    for (const app of state.apps) {
      const option = document.createElement("option");
      option.value = app.key;
      option.textContent =
        app.appName +
        (Date.now() - Date.parse(app.lastSeen) > 30000
          ? " · inactive"
          : " · active");
      fragment.append(option);
    }
    picker.replaceChildren(fragment);
    picker.value = selected;
    el<HTMLButtonElement>("enable").disabled = state.enabled || busy;
    el<HTMLButtonElement>("disable").disabled = !state.enabled || busy;
    el("status").textContent = state.enabled
      ? `Receiver enabled · ${state.apps.length} app instance(s) · ${state.evicted} events evicted`
      : "Receiver disabled";
    const snippet = el<HTMLTextAreaElement>("snippet");
    snippet.hidden = !state.enabled;
    if (state.enabled && state.pairingToken)
      snippet.value = `import { createEdith } from '@edith/sdk';\n\nconst edith = createEdith({\n  enabled: import.meta.env.DEV,\n  appName: 'My app',\n  endpoint: '${location.origin}/__edith_sdk/events',\n  token: '${state.pairingToken}',\n  captureBodies: false,\n});\nedith.install({ captureConsole: true });\n// On teardown: edith.dispose();`;
  }
  async function api(path: string, body?: object): Promise<SdkState> {
    const response = await fetch(`/__edith_sdk/${path}`, {
      method: body ? "POST" : "GET",
      headers: body
        ? { "Content-Type": "application/json", "X-Edith-Token": token }
        : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw new Error("SDK receiver requires the development server.");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "SDK request failed");
    return data;
  }
  async function poll() {
    if (busy || disposed) return;
    busy = true;
    let error = "";
    try {
      const state = await api("status");
      if (disposed) return;
      apply(state);
      if (state.enabled) {
        for (let i = 0; i < 5; i++) {
          const batch = await api(`events?after=${cursor}`);
          if (disposed) return;
          cache = [...cache, ...batch.events].slice(-512);
          if (batch.events.length)
            cursor = batch.events[batch.events.length - 1].id;
          if (selected)
            hooks.events(
              batch.events.filter(
                (e) => `${e.appId}:${e.instanceId}` === selected,
              ),
            );
          if (!batch.events.length || cursor >= batch.lastId) break;
        }
        if (!selected && autoSelect && state.apps.length) {
          autoSelect = false;
          selected = state.apps[0].key;
          picker.value = selected;
          hooks.selection(
            state.apps[0],
            cache.filter((e) => `${e.appId}:${e.instanceId}` === selected),
          );
        }
      }
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason);
    } finally {
      busy = false;
      if (current) apply(current);
      if (error) el("status").textContent = error;
    }
  }
  picker.onchange = () => {
    autoSelect = false;
    selected = picker.value;
    const app = current?.apps.find((a) => a.key === selected) || null;
    hooks.selection(
      app,
      cache.filter((e) => `${e.appId}:${e.instanceId}` === selected),
    );
  };
  async function change(enable: boolean) {
    if (busy) return;
    busy = true;
    try {
      await api("status").then((state) => {
        if (state.controlToken) token = state.controlToken;
      });
      const state = await api(enable ? "enable" : "disable", {});
      pairing = "";
      cursor = 0;
      cache = [];
      selected = "";
      autoSelect = enable;
      hooks.selection(null, []);
      apply(state);
      if (enable) panel.open = true;
    } catch (error) {
      hooks.notify(error instanceof Error ? error.message : String(error));
    } finally {
      busy = false;
      if (current) apply(current);
    }
  }
  el("enable").onclick = () => void change(true);
  el("disable").onclick = () => void change(false);
  const interval = setInterval(() => void poll(), 1000);
  void poll();
  window.addEventListener("beforeunload", () => {
    disposed = true;
    clearInterval(interval);
  });
  return { selected: () => !!selected };
}
