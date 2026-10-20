import { mountGateway } from "./gateway";
import { mountSystemMonitor } from "./system-monitor";
import { mountOverview } from "./overview";
import { icon, iconMarkup, mountIcons, prependIcon } from "./icons";
import type { IconName } from "./icons";
import { mountSdkConnection } from "./sdk-connection";
import { mountLiveProxy } from "./live-proxy";
import { mountPacketTool } from "./packet-tool";
import { bytes } from "./model";
import {
  MAX_FILE_BYTES,
  demoHar,
  demoLogs,
  displayHeaders,
  maskedUrl,
  matchesHttp,
  parseHar,
  parseLogs,
  parseStorage,
  updateStorage,
} from "./debug-model";
import type { HttpEntry, Json, LogEntry } from "./debug-model";
import "./workbench.css";
import "./dropdown.css";

type Tool =
  | "gateway"
  | "system"
  | "overview"
  | "network"
  | "logs"
  | "storage"
  | "packets";
const plugins: Array<{
  id: Tool;
  icon: IconName;
  name: string;
  description: string;
}> = [
  {
    id: "overview",
    icon: "overview",
    name: "Overview",
    description: "Workspace metrics and activity graphs",
  },
  {
    id: "gateway",
    icon: "arrows",
    name: "Gateway",
    description: "Design local routes and backend connections",
  },
  {
    id: "system",
    icon: "cpu",
    name: "System Monitor",
    description: "Whole-machine CPU and RAM metrics",
  },
  {
    id: "network",
    icon: "network",
    name: "Network",
    description: "Inspect live proxied HTTP traffic or HAR files",
  },
  {
    id: "logs",
    icon: "logs",
    name: "Logs",
    description: "Search structured and plain-text logs",
  },
  {
    id: "storage",
    icon: "database",
    name: "Storage",
    description: "Inspect and edit a JSON snapshot",
  },
  {
    id: "packets",
    icon: "activity",
    name: "Packets",
    description: "Explore transport-level packet metadata",
  },
];
const root = document.querySelector<HTMLElement>("#app")!;
root.innerHTML = `<div class="wb-shell">
  <aside class="wb-sidebar"><div class="wb-brand"><span>E</span> EDITH <small>DEVELOPER TOOLS</small></div>
    <div class="wb-target"><span class="wb-target-icon">${iconMarkup("monitor")}</span><div><strong>Local file workspace</strong><small>No app or device connected</small></div></div>
    <p class="wb-label">DEBUG TOOLS</p><nav id="wb-nav" aria-label="Debug tools"></nav>
    <div class="wb-sidebar-note"><strong>Bring your own data</strong><p>Open a HAR, log, or JSON snapshot. Files are processed on this device.</p><button id="wb-guide">Connection guide ${iconMarkup("external")}</button></div>
    <div class="wb-bottom"><span class="wb-dot"></span> Offline workspace <small>Built-in tools · v0.1 alpha</small></div>
  </aside>
  <div class="wb-workspace"><header class="wb-top"><div class="wb-breadcrumb">Local workspace <span>/</span> <strong id="wb-tool-name">Network</strong></div><span class="wb-local">${iconMarkup("shield")} Local processing</span></header>
  <div id="wb-content">
    <section id="tool-overview" class="wb-tool" aria-label="Workspace overview"></section>
    <section id="tool-gateway" class="wb-tool" aria-label="Gateway setup" hidden></section>
    <section id="tool-system" class="wb-tool" aria-label="System Monitor" hidden></section>
    <section id="tool-network" class="wb-tool" aria-label="HTTP Network Inspector" hidden></section>
    <section id="tool-logs" class="wb-tool" aria-label="Log Viewer" hidden></section>
    <section id="tool-storage" class="wb-tool" aria-label="Storage Inspector" hidden></section>
    <section id="tool-packets" hidden><div id="packet-tool"></div></section>
  </div></div></div><div id="wb-toast" class="wb-toast" role="status" hidden></div>
  <dialog id="wb-guide-dialog"><div class="wb-dialog-heading"><h2>Connect your debugging data</h2><button id="wb-close-guide" aria-label="Close guide">${iconMarkup("close")}</button></div><p>EDITH can inspect traffic routed through its development local proxy, or read files you choose. It does not automatically decrypt HTTPS.</p><ol><li><strong>HTTP requests:</strong> start the local proxy and configure your app to use it, or import a HAR. HTTPS tunnels show destinations only.</li><li><strong>Logs:</strong> import UTF-8 text or JSONL, one event per line. Pino numeric levels are supported.</li><li><strong>Storage:</strong> import a JSON object. Edits affect the loaded snapshot only; export to save a copy.</li><li><strong>Packets:</strong> explore sample traffic and native interface discovery. Privileged live capture is still in development.</li></ol><p>HAR files can contain credentials and personal data. Common secret headers are masked initially; bodies may still contain sensitive data.</p><p>JavaScript SDK connections support fetch, logs, and errors in development. Device discovery, live app storage, database queries, and layout inspection are not implemented.</p></dialog>`;
function get<T extends HTMLElement = HTMLElement>(selector: string) {
  return root.querySelector<T>(selector)!;
}
function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  cls = "",
) {
  const n = document.createElement(tag);
  n.textContent = text;
  n.className = cls;
  return n;
}
function action(text: string, callback: () => void, cls = "") {
  const b = node("button", text, cls);
  b.type = "button";
  b.onclick = callback;
  return b;
}
let toastTimer: ReturnType<typeof setTimeout>;
function toast(text: string) {
  clearTimeout(toastTimer);
  get("#wb-toast").textContent = text;
  get("#wb-toast").hidden = false;
  toastTimer = setTimeout(() => (get("#wb-toast").hidden = true), 6000);
}
let active: Tool = "overview";
let gatewayMounted = false;
let systemMonitor: ReturnType<typeof mountSystemMonitor> | undefined;
let overview: ReturnType<typeof mountOverview> | undefined;
let sdkSelected = false;
const nav = get("#wb-nav");
plugins.forEach((plugin) => {
  const button = action("", () => selectTool(plugin.id), "wb-nav-button");
  button.dataset.tool = plugin.id;
  button.setAttribute("aria-label", plugin.description);
  button.append(
    icon(plugin.icon),
    node("span", plugin.name),
    node(
      "small",
      plugin.id === "overview"
        ? "SUMMARY"
        : plugin.id === "gateway"
          ? "SETUP"
          : plugin.id === "packets"
            ? "SAMPLE"
            : ["network", "logs", "system"].includes(plugin.id)
              ? "LIVE"
              : "FILE",
    ),
  );
  nav.append(button);
});
function selectTool(tool: Tool) {
  active = tool;
  plugins.forEach((p) => {
    get(`#tool-${p.id}`).hidden = p.id !== tool;
    const button = get(`[data-tool="${p.id}"]`);
    button.classList.toggle("active", p.id === tool);
    button.setAttribute("aria-current", p.id === tool ? "page" : "false");
  });
  get("#wb-tool-name").textContent = plugins.find((p) => p.id === tool)!.name;
  if (tool === "gateway" && !gatewayMounted) {
    gatewayMounted = true;
    mountGateway(get("#tool-gateway"));
  }
  systemMonitor?.setVisible(tool === "system");
  if (tool === "overview") {
    updateOverview();
    overview?.render();
  }
}
get("#wb-guide").onclick = () =>
  get<HTMLDialogElement>("#wb-guide-dialog").showModal();
get("#wb-close-guide").onclick = () =>
  get<HTMLDialogElement>("#wb-guide-dialog").close();
function download(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = node("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Export requested. The downloaded copy may contain sensitive values.");
}
function fileInput(
  accept: string,
  onload: (text: string, name: string) => void,
) {
  const input = node("input");
  input.type = "file";
  input.accept = accept;
  input.hidden = true;
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_FILE_BYTES)
        throw new Error("Choose a file smaller than 10 MB.");
      const text = await file.text();
      onload(text, file.name);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    } finally {
      input.value = "";
    }
  };
  return input;
}
function sourceLabel(name: string, count: number) {
  return `${name} · ${count.toLocaleString()} records · local only`;
}
function buildTool(
  tool: Tool,
  title: string,
  description: string,
  importLabel: string,
) {
  const section = get(`#tool-${tool}`);
  section.innerHTML = `<div class="wb-title-row"><div><div class="wb-eyebrow">BUILT-IN TOOL</div><h1></h1><p></p></div><div class="wb-actions"><button data-action="demo">Load demo</button><button data-action="import" class="wb-primary"></button></div></div><div class="wb-source" role="status">No file loaded · import a file or try the demo</div><div class="wb-toolbar"><input type="search" placeholder="Search…" aria-label="Search ${title}"><div class="wb-filters"></div><button data-action="clear">Clear</button><button data-action="export">Export</button></div><div class="wb-split"><div class="wb-results"><div class="wb-result-count"></div><div class="wb-table-wrap"><table class="wb-table"><thead></thead><tbody></tbody></table></div><div class="wb-empty"><span>${iconMarkup("search")}</span><h2></h2><p></p></div></div><aside class="wb-inspector"><div class="wb-inspector-heading">Inspector</div><div class="wb-inspector-content"></div></aside></div>`;
  section.querySelector("h1")!.textContent = title;
  section.querySelector(".wb-title-row p")!.textContent = description;
  section.querySelector('[data-action="import"]')!.textContent = importLabel;
  for (const [actionName, name] of [
    ["demo", "demo"],
    ["import", "upload"],
    ["clear", "clear"],
    ["export", "download"],
  ] as const)
    prependIcon(within(section, `[data-action="${actionName}"]`), name);
  mountIcons(section);
  return section;
}
function within<T extends HTMLElement = HTMLElement>(
  section: HTMLElement,
  selector: string,
) {
  return section.querySelector<T>(selector)!;
}
function setSource(section: HTMLElement, value: string) {
  within(section, ".wb-source").textContent = value;
}
function tableHead(section: HTMLElement, titles: string[]) {
  const row = node("tr");
  titles.forEach((title) => row.append(node("th", title)));
  within(section, "thead").replaceChildren(row);
}
function empty(
  section: HTMLElement,
  count: number,
  title: string,
  description: string,
) {
  within(section, ".wb-empty").hidden = count > 0;
  within(section, ".wb-empty h2").textContent = title;
  within(section, ".wb-empty p").textContent = description;
  within(section, ".wb-table-wrap").hidden = count === 0;
}
function inspector(section: HTMLElement) {
  return within(section, ".wb-inspector-content");
}
function inspectorEmpty(section: HTMLElement, text: string) {
  inspector(section).replaceChildren(node("p", text, "wb-inspector-empty"));
}
function definition(items: Array<[string, string]>) {
  const dl = node("dl");
  items.forEach(([key, value]) =>
    dl.append(node("dt", key), node("dd", value)),
  );
  return dl;
}
function codeSection(title: string, text: string) {
  const section = node("section", "", "wb-code-section");
  section.append(
    node("h3", title),
    node("pre", text || "(Not included in this file)"),
  );
  return section;
}
function selector(
  label: string,
  values: string[],
  change: (value: string) => void,
) {
  const select = node("select");
  select.setAttribute("aria-label", label);
  values.forEach((value) => {
    const option = node(
      "option",
      value === "all" ? `All ${label.toLowerCase()}` : value,
    );
    option.value = value;
    select.append(option);
  });
  select.onchange = () => change(select.value);
  return select;
}
function markSelected(section: HTMLElement, id: number) {
  section
    .querySelectorAll<HTMLButtonElement>("[data-record]")
    .forEach((button) => {
      const selected = Number(button.dataset.record) === id;
      button.setAttribute("aria-pressed", String(selected));
      button.closest("tr")!.classList.toggle("selected", selected);
    });
}

// HTTP inspector: explicit local proxy traffic or user-selected HAR files.
const network = buildTool(
  "network",
  "Network Inspector",
  "Explore HTTP requests, headers, responses, and timing.",
  "Import HAR",
);
tableHead(network, ["METHOD", "STATUS", "REQUEST", "DURATION", "SIZE"]);
let requests: HttpEntry[] = [],
  httpSelected: number | null = null,
  httpQuery = "",
  httpStatus = "all",
  httpMethod = "all",
  reveal = false,
  httpTab = "Overview";
let httpSource = "No file loaded";
let gatewayInstance = "all";
let gatewayRequests: HttpEntry[] = [],
  gatewayLogs: LogEntry[] = [];
let gatewayView = false,
  gatewayLogView = false,
  gatewayRoute = "all";
const networkOriginSelect = selector(
  "Traffic source",
  ["current", "gateway"],
  (value) => {
    gatewayView = value === "gateway";
    httpSelected = null;
    renderHttp();
  },
);
networkOriginSelect.options[0].text = "Files / HTTP Proxy / selected SDK";
networkOriginSelect.options[1].text = "Gateway";
const gatewayInstanceSelect = selector("Gateway instance", ["all"], (value) => {
  gatewayInstance = value;
  httpSelected = null;
  renderHttp();
});
const gatewayRouteSelect = selector("Gateway route", ["all"], (value) => {
  gatewayRoute = value;
  httpSelected = null;
  renderHttp();
});
within(network, ".wb-filters").append(
  networkOriginSelect,
  gatewayInstanceSelect,
  gatewayRouteSelect,
);
function visibleRequests() {
  return gatewayView
    ? gatewayRequests.filter(
        (r) =>
          (gatewayRoute === "all" || r.routePath === gatewayRoute) &&
          (gatewayInstance === "all" || r.gatewayId === gatewayInstance),
      )
    : requests;
}
function networkLabel() {
  return gatewayView ? "Gateway" : httpSource;
}

const httpStatusSelect = selector(
  "Statuses",
  ["all", "2xx", "3xx", "4xx", "5xx", "failed"],
  (value) => {
    httpStatus = value;
    renderHttp();
  },
);
const standardHttpMethods = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "CONNECT",
  "TRACE",
];
const httpMethodSelect = selector(
  "Methods",
  ["all", ...standardHttpMethods],
  (value) => {
    httpMethod = value;
    renderHttp();
  },
);
within(network, ".wb-filters").append(httpStatusSelect, httpMethodSelect);
const harFile = fileInput(".har,.json,application/json", (text, name) =>
  loadHar(text, name),
);
network.append(harFile);
function loadHar(text: string, name: string) {
  if (sdkSelected) {
    toast("Select Files / Local proxy before importing a HAR.");
    return;
  }
  if (liveProxy.isRunning()) {
    toast("Stop the proxy before loading a HAR or demo.");
    return;
  }
  gatewayView = false;
  networkOriginSelect.value = "current";
  liveProxy.leaveLive();
  const parsed = parseHar(text);
  requests = parsed;
  httpSource = name;
  httpSelected = null;
  httpMethod = "all";
  reveal = false;
  httpTab = "Overview";
  httpMethodSelect.replaceChildren();
  [
    "all",
    ...new Set([...standardHttpMethods, ...parsed.map((p) => p.method)]),
  ].forEach((value) => {
    const option = node("option", value === "all" ? "All methods" : value);
    option.value = value;
    httpMethodSelect.append(option);
  });
  setSource(network, sourceLabel(name, parsed.length));
  renderHttp();
}
function showHttp(entry: HttpEntry) {
  httpSelected = entry.id;
  markSelected(network, entry.id);
  const panel = inspector(network);
  panel.replaceChildren(
    node("span", `${entry.method} · ${entry.status || "Failed"}`, "wb-tag"),
    node("h2", maskedUrl(entry.url, reveal), "wb-url"),
  );
  const tabs = node("div", "", "wb-detail-tabs");
  ["Overview", "Request", "Response", "Timing"].forEach((tab) => {
    const button = action(tab, () => {
      httpTab = tab;
      showHttp(entry);
    });
    button.setAttribute("aria-pressed", String(httpTab === tab));
    tabs.append(button);
  });
  panel.append(tabs);
  const toggle = action(
    reveal ? "Hide credentials" : "Reveal credentials",
    () => {
      reveal = !reveal;
      renderHttp();
    },
    "wb-reveal",
  );
  prependIcon(toggle, reveal ? "eyeOff" : "eye");
  panel.append(toggle);
  if (httpTab === "Overview")
    panel.append(
      definition([
        ["Started", entry.timestamp || "Unavailable"],
        ["Duration", `${entry.duration.toFixed(1)} ms`],
        ["Content size", bytes(entry.size)],
        ["Content type", entry.mimeType || "Unavailable"],
        [
          "Source",
          entry.captureKind === "gateway"
            ? `Gateway :${entry.gatewayPort || ""} · ${entry.routePath}`
            : httpSource,
        ],
        ...(entry.upstream
          ? [["Backend", entry.upstream] as [string, string]]
          : []),
      ]),
      node(
        "p",
        entry.captureKind === "gateway"
          ? `Captured through Gateway route ${entry.routePath}. ${entry.error || "Forwarded to backend."}`
          : entry.captureKind === "sdk"
            ? `Reported by the connected app SDK. Duration measures fetch until response headers. ${entry.error || "Bodies require explicit captureBodies opt-in."}`
            : entry.captureKind === "tunnel"
              ? "HTTPS tunnel only. Status is the tunnel establishment result; duration is connection setup, not an HTTPS response. No encrypted payload is inspected."
              : entry.captureKind === "http"
                ? `Captured through the local proxy. ${entry.error || "HTTP forwarded to its upstream destination."}`
                : "Imported HAR metadata. No requests are replayed or sent.",
        "wb-footnote",
      ),
    );
  if (httpTab === "Request" || httpTab === "Response") {
    const request = httpTab === "Request";
    const headers = displayHeaders(
      request ? entry.requestHeaders : entry.responseHeaders,
      reveal,
    );
    panel.append(
      codeSection(
        "HEADERS",
        headers.map((h) => `${h.name}: ${h.value}`).join("\n"),
      ),
    );
    const body = request ? entry.requestBody : entry.responseBody;
    if (request && entry.requestEncoding)
      panel.append(
        node(
          "p",
          `Request body encoding: ${entry.requestEncoding}`,
          "wb-footnote",
        ),
      );
    if (request ? entry.requestTruncated : entry.responseTruncated)
      panel.append(
        node(
          "p",
          "Capture truncated to the first 32 KB. Forwarding was not truncated.",
          "wb-warning",
        ),
      );
    panel.append(
      codeSection(
        request
          ? "REQUEST BODY"
          : `RESPONSE BODY${entry.encoding ? ` · ${entry.encoding} encoded` : ""}`,
        body,
      ),
    );
    panel.append(
      node(
        "p",
        "Bodies are displayed as text and may contain secrets. Encoded payloads are shown without decoding.",
        "wb-footnote",
      ),
    );
  }
  if (httpTab === "Timing") {
    panel.append(
      node(
        "p",
        entry.captureKind === "sdk"
          ? "Measured by the SDK until fetch response headers arrive; body transfer is not included."
          : entry.captureKind
            ? "Measured by the local proxy. Total includes forwarding; tunnel connect measures setup only."
            : "Values reported by the HAR exporter. Missing phases are not estimated.",
        "wb-footnote",
      ),
    );
    for (const [name, duration] of Object.entries(entry.timings)) {
      const row = node("div", "", "wb-timing");
      row.append(
        node("span", name),
        node("strong", `${duration.toFixed(1)} ms`),
      );
      const meter = node("progress");
      meter.max = Math.max(entry.duration, duration, 1);
      meter.value = duration;
      meter.setAttribute("aria-label", `${name} duration`);
      row.append(meter);
      panel.append(row);
    }
  }
}
function updateOverview() {
  overview?.update({
    requests: visibleRequests(),
    logs: gatewayLogView ? gatewayLogs : logEntries,
    networkSource: networkLabel(),
    logSource: gatewayLogView ? "Gateway errors" : logSource,
  });
}
function renderHttp() {
  updateOverview();
  gatewayRouteSelect.hidden = !gatewayView;
  gatewayInstanceSelect.hidden = !gatewayView;
  setSource(
    network,
    `${networkLabel()} · ${visibleRequests().length} retained records`,
  );
  const filtered = visibleRequests().filter((entry) =>
    matchesHttp(entry, httpQuery, httpStatus, httpMethod),
  );
  const rows = document.createDocumentFragment();
  const displayed =
    gatewayView || sdkSelected || liveProxy.isViewing()
      ? filtered.slice(-500).reverse()
      : filtered.slice(0, 500);
  displayed.forEach((entry) => {
    const row = node("tr");
    row.classList.toggle("selected", httpSelected === entry.id);
    const method = node("td");
    method.append(node("span", entry.method, "wb-method"));
    const status = node("td");
    status.append(
      node(
        "span",
        String(entry.status || "Failed"),
        entry.status >= 400 || !entry.status ? "wb-error" : "wb-success",
      ),
    );
    const url = node("td");
    const button = action("", () => showHttp(entry), "wb-row-select");
    button.dataset.record = String(entry.id);
    button.setAttribute("aria-pressed", String(httpSelected === entry.id));
    button.append(
      node("span", maskedUrl(entry.url, reveal)),
      node(
        "small",
        `${entry.captureKind === "gateway" ? `Gateway :${entry.gatewayPort || ""} · ${entry.routePath}` : entry.captureKind === "sdk" ? "SDK" : entry.captureKind ? "HTTP Proxy" : "HAR"} · ${entry.mimeType || "Unknown content type"}`,
      ),
    );
    url.append(button);
    row.append(
      method,
      status,
      url,
      node("td", `${entry.duration.toFixed(0)} ms`),
      node("td", bytes(entry.size)),
    );
    rows.append(row);
  });
  within(network, "tbody").replaceChildren(rows);
  within(network, ".wb-result-count").textContent =
    `${filtered.length} matching requests · ${gatewayView || sdkSelected || liveProxy.isViewing() ? "newest" : "first"} 500 shown`;
  empty(
    network,
    filtered.length,
    visibleRequests().length
      ? "No matching requests"
      : "Every request has a story.",
    visibleRequests().length
      ? "Adjust the search or filters."
      : "Start the local proxy and route your app through it, import a HAR, or load a demo.",
  );
  const selected = visibleRequests().find((r) => r.id === httpSelected);
  if (selected) showHttp(selected);
  else
    inspectorEmpty(
      network,
      "Select a request to inspect headers, payloads, and timings.",
    );
}
within<HTMLInputElement>(network, 'input[type="search"]').oninput = (e) => {
  httpQuery = (e.target as HTMLInputElement).value;
  renderHttp();
};
within(network, '[data-action="demo"]').onclick = () =>
  loadHar(demoHar(), "Demo HAR · generated example");
within(network, '[data-action="import"]').onclick = () => harFile.click();
within(network, '[data-action="clear"]').onclick = () => {
  if (gatewayView) {
    gatewayRequests = [];
    httpSelected = null;
    renderHttp();
    return;
  }
  liveProxy.clearView();
  requests = [];
  httpSelected = null;
  reveal = false;
  setSource(
    network,
    liveProxy.isViewing()
      ? "Live proxy view cleared · waiting for new traffic"
      : "No file loaded",
  );
  renderHttp();
};
within(network, '[data-action="export"]').onclick = () => {
  const filtered = visibleRequests().filter((entry) =>
    matchesHttp(entry, httpQuery, httpStatus, httpMethod),
  );
  if (!filtered.length) {
    toast("No matching requests to export.");
    return;
  }
  download("edith-http-inspection.json", {
    format: "edith-http-inspection",
    source: networkLabel(),
    requests: filtered,
  });
};

const liveProxy = mountLiveProxy(network, {
  reset() {
    if (sdkSelected) return;
    requests = [];
    httpSelected = null;
    httpMethod = "all";
    httpMethodSelect.value = "all";
    reveal = false;
    httpSource = "Live local proxy";
    renderHttp();
  },
  entries(incoming) {
    if (sdkSelected) return;
    requests = [...requests, ...incoming].slice(-256);
    const methods = [...new Set(requests.map((entry) => entry.method))];
    methods.forEach((method) => {
      if (
        ![...httpMethodSelect.options].some((option) => option.value === method)
      ) {
        const option = node("option", method);
        option.value = method;
        httpMethodSelect.append(option);
      }
    });
    renderHttp();
  },
  status(status) {
    if (sdkSelected) return;
    httpSource = `Local proxy · ${status.state}${status.port ? ` · 127.0.0.1:${status.port}` : ""}`;
    setSource(
      network,
      `${httpSource} · ${status.total} captured · up to 256 retained · HTTPS tunnels are metadata only`,
    );
    within<HTMLButtonElement>(network, '[data-action="demo"]').disabled =
      status.state === "running";
    within<HTMLButtonElement>(network, '[data-action="import"]').disabled =
      status.state === "running";
    updateOverview();
  },
  notify: toast,
});

// Log viewer: bounded imports; raw content is always inserted as text.
const logs = buildTool(
  "logs",
  "Log Viewer",
  "Find the signal in structured logs and plain-text output.",
  "Import logs",
);
tableHead(logs, ["LEVEL", "TIME", "SOURCE", "MESSAGE"]);
let logEntries: LogEntry[] = [],
  logQuery = "",
  logLevel = "all",
  logSource = "No file loaded",
  logSelected: number | null = null;
within(logs, ".wb-filters").append(
  selector(
    "Levels",
    ["all", "TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL", "UNKNOWN"],
    (value) => {
      logLevel = value;
      renderLogs();
    },
  ),
);
const logFile = fileInput(".log,.txt,.jsonl,.ndjson,text/plain", (text, name) =>
  loadLogs(text, name),
);
logs.append(logFile);
function loadLogs(text: string, name: string) {
  if (sdkSelected) {
    toast("Select Files / Local proxy before importing logs.");
    return;
  }
  const parsed = parseLogs(text);
  logEntries = parsed;
  logSource = name;
  logSelected = null;
  setSource(logs, sourceLabel(name, parsed.length));
  renderLogs();
}
function showLog(entry: LogEntry) {
  logSelected = entry.id;
  markSelected(logs, entry.id);
  inspector(logs).replaceChildren(
    node(
      "span",
      entry.level,
      `wb-tag ${entry.level === "ERROR" || entry.level === "FATAL" ? "wb-error" : ""}`,
    ),
    node("h2", entry.message, "wb-log-message"),
    definition([
      ["Timestamp", entry.timestamp || "Not present"],
      ["Source", entry.source],
      ["Line", String(entry.id)],
      ["File", gatewayLogView ? "Gateway runtime" : logSource],
    ]),
    codeSection("RAW EVENT", entry.raw),
  );
}
const logOriginSelect = selector(
  "Log source",
  ["current", "gateway"],
  (value) => {
    gatewayLogView = value === "gateway";
    logSelected = null;
    renderLogs();
  },
);
logOriginSelect.options[0].text = "File / selected SDK";
logOriginSelect.options[1].text = "Gateway errors";
within(logs, ".wb-filters").append(logOriginSelect);
function filteredLogs() {
  return (gatewayLogView ? gatewayLogs : logEntries).filter(
    (entry) =>
      (logLevel === "all" || entry.level === logLevel) &&
      `${entry.message} ${entry.source} ${entry.raw}`
        .toLowerCase()
        .includes(logQuery.trim().toLowerCase()),
  );
}
function renderLogs() {
  updateOverview();
  setSource(
    logs,
    gatewayLogView
      ? `Gateway · ${gatewayLogs.length} retained errors`
      : logSource,
  );
  const filtered = filteredLogs();
  const rows = document.createDocumentFragment();
  (gatewayLogView || sdkSelected
    ? filtered.slice(-500).reverse()
    : filtered.slice(0, 500)
  ).forEach((entry) => {
    const row = node("tr");
    row.classList.toggle("selected", entry.id === logSelected);
    row.append(
      node(
        "td",
        entry.level,
        entry.level === "ERROR" || entry.level === "FATAL"
          ? "wb-error"
          : entry.level === "WARN"
            ? "wb-warning"
            : "wb-muted",
      ),
      node("td", entry.timestamp || "—", "wb-log-time"),
      node("td", entry.source),
    );
    const message = node("td");
    const button = action(entry.message, () => showLog(entry), "wb-row-select");
    button.dataset.record = String(entry.id);
    button.setAttribute("aria-pressed", String(entry.id === logSelected));
    message.append(button);
    row.append(message);
    rows.append(row);
  });
  within(logs, "tbody").replaceChildren(rows);
  within(logs, ".wb-result-count").textContent =
    `${filtered.length} matching events · ${sdkSelected ? "newest" : "first"} 500 shown`;
  empty(
    logs,
    filtered.length,
    (gatewayLogView ? gatewayLogs : logEntries).length
      ? "No matching events"
      : "Less noise. More context.",
    (gatewayLogView ? gatewayLogs : logEntries).length
      ? "Adjust search or log level."
      : "Import a text or JSONL file. Logs remain on your device.",
  );
  const selected = (gatewayLogView ? gatewayLogs : logEntries).find(
    (entry) => entry.id === logSelected,
  );
  if (selected) showLog(selected);
  else
    inspectorEmpty(logs, "Select an event to inspect its original log line.");
}
within<HTMLInputElement>(logs, 'input[type="search"]').oninput = (e) => {
  logQuery = (e.target as HTMLInputElement).value;
  renderLogs();
};
within(logs, '[data-action="demo"]').onclick = () =>
  loadLogs(demoLogs, "Demo logs · generated example");
within(logs, '[data-action="import"]').onclick = () => logFile.click();
within(logs, '[data-action="clear"]').onclick = () => {
  if (gatewayLogView) {
    gatewayLogs = [];
    logSelected = null;
    renderLogs();
    return;
  }
  logEntries = [];
  logSelected = null;
  setSource(logs, "No file loaded");
  renderLogs();
};
within(logs, '[data-action="export"]').onclick = () => {
  const events = filteredLogs();
  if (!events.length) {
    toast("No matching logs to export.");
    return;
  }
  download("edith-logs.json", {
    format: "edith-logs",
    source: gatewayLogView ? "Gateway errors" : logSource,
    events,
  });
};

// Storage edits apply only to the imported in-memory snapshot, never another app.
const storage = buildTool(
  "storage",
  "Storage Inspector",
  "Inspect JSON keys. Edit a snapshot without changing your app.",
  "Import JSON",
);
tableHead(storage, ["KEY", "TYPE", "VALUE"]);
let snapshot: Record<string, Json> = {},
  storageQuery = "",
  storageKey: string | null = null,
  storageSource = "No file loaded",
  dirty = false;
const storageFile = fileInput(".json,application/json", (text, name) =>
  loadStorage(text, name),
);
storage.append(storageFile);
function loadStorage(text: string, name: string) {
  const parsed = parseStorage(text);
  snapshot = parsed;
  storageKey = null;
  storageSource = name;
  dirty = false;
  renderStorage();
}
function showStorage(key: string) {
  storageKey = key;
  const entries = Object.entries(snapshot);
  markSelected(
    storage,
    entries.findIndex(([name]) => name === key),
  );
  const panel = inspector(storage);
  panel.replaceChildren(
    node("span", "SNAPSHOT ONLY", "wb-tag"),
    node("h2", key, "wb-url"),
    node(
      "p",
      "Changes stay in this workspace until you export a copy. They do not change application storage.",
      "wb-footnote",
    ),
  );
  const field = node("textarea");
  field.value = JSON.stringify(snapshot[key], null, 2);
  field.setAttribute("aria-label", `JSON value for ${key}`);
  field.spellcheck = false;
  panel.append(field);
  const error = node("p", "", "wb-error");
  error.setAttribute("role", "alert");
  panel.append(error);
  panel.append(
    action(
      "Apply to snapshot",
      () => {
        try {
          snapshot = updateStorage(snapshot, key, field.value);
          dirty = true;
          renderStorage();
          toast("Snapshot updated. Export to save a copy.");
        } catch (reason) {
          error.textContent =
            reason instanceof Error ? reason.message : String(reason);
        }
      },
      "wb-primary",
    ),
  );
}
function renderStorage() {
  const entries = Object.entries(snapshot);
  const filtered = entries.filter(([key, value]) =>
    `${key} ${JSON.stringify(value)}`
      .toLowerCase()
      .includes(storageQuery.trim().toLowerCase()),
  );
  const rows = document.createDocumentFragment();
  filtered.slice(0, 500).forEach(([key, value]) => {
    const row = node("tr");
    row.classList.toggle("selected", storageKey === key);
    const cell = node("td");
    const button = action(key, () => showStorage(key), "wb-row-select");
    button.dataset.record = String(entries.findIndex(([name]) => name === key));
    button.setAttribute("aria-pressed", String(storageKey === key));
    cell.append(button);
    const type =
      value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
    const serialized = JSON.stringify(value);
    row.append(
      cell,
      node("td", type, "wb-muted"),
      node(
        "td",
        serialized.length > 180 ? serialized.slice(0, 180) + "…" : serialized,
        "wb-storage-value",
      ),
    );
    rows.append(row);
  });
  within(storage, "tbody").replaceChildren(rows);
  setSource(
    storage,
    `${storageSource} · ${entries.length} keys${dirty ? " · unsaved snapshot changes" : ""}`,
  );
  within(storage, ".wb-result-count").textContent =
    `${filtered.length} matching keys · first 500 shown`;
  empty(
    storage,
    filtered.length,
    entries.length ? "No matching keys" : "Look inside your app state.",
    entries.length
      ? "Try another key or value."
      : "Import a JSON object to inspect values and edit a local copy.",
  );
  if (
    storageKey !== null &&
    Object.prototype.hasOwnProperty.call(snapshot, storageKey)
  )
    showStorage(storageKey);
  else
    inspectorEmpty(storage, "Select a key to inspect or edit its JSON value.");
}
within<HTMLInputElement>(storage, 'input[type="search"]').oninput = (e) => {
  storageQuery = (e.target as HTMLInputElement).value;
  renderStorage();
};
within(storage, '[data-action="demo"]').onclick = () =>
  loadStorage(
    JSON.stringify({
      theme: "dark",
      "feature.checkoutV2": true,
      cart: { items: [{ id: "demo_product", quantity: 2 }] },
      "session.preferences": { language: "en", currency: "USD" },
      lastSync: null,
    }),
    "Demo storage · generated example",
  );
within(storage, '[data-action="import"]').onclick = () => storageFile.click();
within(storage, '[data-action="clear"]').onclick = () => {
  snapshot = {};
  storageKey = null;
  dirty = false;
  storageSource = "No file loaded";
  renderStorage();
};
within(storage, '[data-action="export"]').onclick = () => {
  if (!Object.keys(snapshot).length) {
    toast("No snapshot to export.");
    return;
  }
  download("edith-storage-snapshot.json", snapshot);
};
const sdk = mountSdkConnection(root, {
  selection(app, events) {
    sdkSelected = !!app;
    gatewayView = gatewayLogView = false;
    networkOriginSelect.value = logOriginSelect.value = "current";
    requests = [];
    logEntries = [];
    httpSelected = logSelected = null;
    reveal = false;
    httpSource = app ? `SDK · ${app.appName}` : "Files / Local proxy";
    logSource = httpSource;
    setSource(network, httpSource);
    setSource(logs, logSource);
    for (const tool of [network, logs])
      for (const actionName of ["import", "demo"])
        within<HTMLButtonElement>(
          tool,
          `[data-action="${actionName}"]`,
        ).disabled = !!app;
    if (app) ingestSdk(events);
    renderHttp();
    renderLogs();
  },
  events: ingestSdk,
  notify: toast,
});
function ingestSdk(
  events: Array<{ type: string; data: HttpEntry | LogEntry }>,
) {
  if (!sdk.selected()) return;
  const incomingRequests = events
    .filter((e) => e.type === "network")
    .map((e) => e.data as HttpEntry);
  requests = [...requests, ...incomingRequests].slice(-256);
  logEntries = [
    ...logEntries,
    ...events
      .filter((e) => e.type === "log" || e.type === "error")
      .map((e) => e.data as LogEntry),
  ].slice(-512);
  for (const entry of incomingRequests)
    if (![...httpMethodSelect.options].some((o) => o.value === entry.method)) {
      const option = node("option", entry.method);
      option.value = entry.method;
      httpMethodSelect.append(option);
    }
  setSource(
    network,
    `${httpSource} · ${requests.length} retained HTTP records · instrumented fetch only`,
  );
  setSource(
    logs,
    `${logSource} · ${logEntries.length} retained log/error events`,
  );
  renderHttp();
  renderLogs();
}
overview = mountOverview(get("#tool-overview"), {
  network(method, status) {
    httpQuery = "";
    httpMethod = method || "all";
    httpStatus = status || "all";
    for (const [select, value] of [
      [httpMethodSelect, httpMethod],
      [httpStatusSelect, httpStatus],
    ] as const) {
      if (![...select.options].some((o) => o.value === value)) {
        const option = node("option", value);
        option.value = value;
        select.append(option);
      }
      select.value = value;
    }
    within<HTMLInputElement>(network, 'input[type="search"]').value = "";
    renderHttp();
    selectTool("network");
  },
  logs() {
    selectTool("logs");
  },
  demo() {
    if (sdkSelected || liveProxy.isRunning()) {
      toast(
        "Select Files / Local proxy and stop the proxy before loading the overview demo.",
      );
      return;
    }
    loadHar(demoHar(), "Demo HAR · generated example");
    loadLogs(demoLogs, "Demo logs · generated example");
  },
});
systemMonitor = mountSystemMonitor(get("#tool-system"));
mountIcons(root);
mountPacketTool(get("#packet-tool"));
renderHttp();
renderLogs();
renderStorage();
selectTool(active);

let gatewayCursor = 0;
async function pollGatewayEvents() {
  try {
    const response = await fetch(
      `/__edith_gateway/events?after=${gatewayCursor}`,
      { signal: AbortSignal.timeout(4000), cache: "no-store" },
    );
    if (!response.ok) return;
    const data = (await response.json()) as {
      lastId: number;
      records: HttpEntry[];
      logs: LogEntry[];
    };
    if (
      !Array.isArray(data.records) ||
      !Array.isArray(data.logs) ||
      !Number.isSafeInteger(data.lastId)
    )
      return;
    if (data.lastId < gatewayCursor) {
      gatewayCursor = 0;
      gatewayRequests = [];
      gatewayLogs = [];
      return;
    }
    if (
      data.records.length &&
      !gatewayRequests.length &&
      !requests.length &&
      !sdkSelected
    ) {
      gatewayView = true;
      networkOriginSelect.value = "gateway";
    }
    gatewayRequests = [...gatewayRequests, ...data.records].slice(-256);
    gatewayLogs = [...gatewayLogs, ...data.logs].slice(-256);
    gatewayCursor = data.lastId;
    for (const entry of data.records) {
      if (
        entry.gatewayId &&
        ![...gatewayInstanceSelect.options].some(
          (o) => o.value === entry.gatewayId,
        )
      ) {
        const o = node("option", `Gateway :${entry.gatewayPort}`);
        o.value = entry.gatewayId;
        gatewayInstanceSelect.append(o);
      }

      if (
        entry.routePath &&
        ![...gatewayRouteSelect.options].some(
          (o) => o.value === entry.routePath,
        )
      ) {
        const o = node("option", entry.routePath);
        o.value = entry.routePath;
        gatewayRouteSelect.append(o);
      }
      if (
        ![...httpMethodSelect.options].some((o) => o.value === entry.method)
      ) {
        const o = node("option", entry.method);
        o.value = entry.method;
        httpMethodSelect.append(o);
      }
    }
    if (gatewayView) renderHttp();
    if (gatewayLogView) renderLogs();
  } catch {
    /* Development service can be unavailable in packaged/static builds. */
  } finally {
    setTimeout(pollGatewayEvents, 1000);
  }
}
void pollGatewayEvents();
window.addEventListener("edith-gateway-view", (event) => {
  const detail = (event as CustomEvent<{ gatewayId: string; path: string }>)
    .detail;
  const path = detail.path;
  gatewayInstance = detail.gatewayId;
  if (
    ![...gatewayInstanceSelect.options].some(
      (o) => o.value === detail.gatewayId,
    )
  ) {
    const o = node("option", "Selected Gateway");
    o.value = detail.gatewayId;
    gatewayInstanceSelect.append(o);
  }
  gatewayInstanceSelect.value = detail.gatewayId;
  gatewayView = true;
  networkOriginSelect.value = "gateway";
  gatewayRoute = path;
  if (![...gatewayRouteSelect.options].some((o) => o.value === path)) {
    const o = node("option", path);
    o.value = path;
    gatewayRouteSelect.append(o);
  }
  gatewayRouteSelect.value = path;
  httpQuery = "";
  httpStatus = httpMethod = "all";
  httpStatusSelect.value = httpMethodSelect.value = "all";
  within<HTMLInputElement>(network, 'input[type="search"]').value = "";
  httpSelected = null;
  selectTool("network");
  renderHttp();
});
