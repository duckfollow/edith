import { invoke, isTauri } from "@tauri-apps/api/core";
import { icon, setIconLabel } from "./icons";
import { renderTimeSeries } from "./time-series";
import {
  memoryBytes,
  retainSamples,
  systemSeries,
  validSystemSample,
} from "./system-model";
import type { SystemSample } from "./system-model";
export function mountSystemMonitor(root: HTMLElement) {
  root.innerHTML = `<div class="wb-title-row"><div><div class="wb-eyebrow">LOCAL MACHINE</div><h1>System Monitor</h1><p>CPU and RAM on the machine running EDITH.</p></div><div class="wb-actions"><select data-system="window" aria-label="System graph history"><option value="60">Last 60 seconds</option><option value="300">Last 5 minutes</option></select><button data-system="pause">Pause</button><button data-system="clear">Clear history</button></div></div><div class="system-status"><span class="dot"></span><span data-system="status" role="status">Open this tool to start collecting real metrics.</span><span data-system="last"></span></div><div data-system="error" class="system-error" role="alert" hidden></div><div class="ov-metrics" data-system="metrics"></div><div class="ov-charts system-charts"><section class="ov-chart"><div class="ov-chart-heading"><h2>CPU usage</h2><span>Whole machine · 0–100%</span></div><div data-system="cpu-chart" class="ov-plot"></div></section><section class="ov-chart"><div class="ov-chart-heading"><h2>RAM usage</h2><span>Non-free RAM · 0–100%</span></div><div data-system="memory-chart" class="ov-plot"></div></section></div><section class="ov-chart"><div class="ov-chart-heading"><h2>Logical CPU cores</h2><span data-system="cpu-model">Waiting for system data</span></div><div class="system-cores" data-system="cores"></div></section><p class="ov-scope">Machine-wide metrics, independent of the selected SDK app. Non-free RAM is total minus OS-reported free memory and can include caches; it is not memory pressure or per-process usage. Samples stay in memory (up to 300) and collection stops when you leave this tool.</p>`;
  function get<T extends HTMLElement = HTMLElement>(name: string) {
    return root.querySelector<T>(`[data-system="${name}"]`)!;
  }
  function el(tag: string, text = "", cls = "") {
    const n = document.createElement(tag);
    n.textContent = text;
    n.className = cls;
    return n;
  }
  let history: SystemSample[] = [],
    visible = false,
    paused = false,
    busy = false,
    generation = 0,
    seconds = 60,
    error = "",
    reset = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: AbortController | undefined;
  const native = isTauri();
  function draw() {
    const latest = history[history.length - 1];
    get("status").textContent = paused
      ? "Paused · no new samples"
      : visible
        ? "Sampling every second · " +
          (native ? "native system metrics" : "development host metrics")
        : "Not collecting while this tool is hidden";
    get("last").textContent = latest
      ? `Updated ${new Date(latest.timestamp).toLocaleTimeString()}`
      : "";
    get("error").hidden = !error;
    get("error").textContent = error;
    setIconLabel(
      get("pause"),
      paused ? "play" : "pause",
      paused ? "Resume" : "Pause",
    );
    setIconLabel(get("clear"), "clear", "Clear history");
    const cards: Array<[string, string, string]> = [
      [
        "CPU usage",
        latest?.cpuPercent == null ? "—" : `${latest.cpuPercent.toFixed(1)}%`,
        latest?.cpuPercent == null
          ? "Waiting for a second CPU sample"
          : `${latest.logicalCores} logical cores · normalized to 100%`,
      ],
      [
        "RAM non-free",
        latest ? memoryBytes(latest.memoryUsedBytes) : "—",
        latest
          ? `${latest.memoryPercent.toFixed(1)}% of total RAM`
          : "Waiting for system data",
      ],
      [
        "RAM free",
        latest ? memoryBytes(latest.memoryFreeBytes) : "—",
        "OS-reported free memory",
      ],
      [
        "RAM total",
        latest ? memoryBytes(latest.memoryTotalBytes) : "—",
        latest ? `${latest.platform} · ${latest.arch}` : "Local machine only",
      ],
    ];
    const metrics = get("metrics");
    metrics.replaceChildren();
    cards.forEach(([label, value, note], i) => {
      const card = el("section", "", "ov-stat"),
        heading = el("div", "", "ov-stat-label");
      heading.append(icon(i === 0 ? "cpu" : "memory"), el("span", label));
      card.append(heading, el("strong", value), el("small", note));
      metrics.append(card);
    });
    renderTimeSeries(
      get("cpu-chart"),
      systemSeries(history, seconds, "cpuPercent"),
      "average",
      {
        id: "system-cpu",
        unit: "%",
        label: "Inspect whole-machine CPU usage",
        peakLabel: "Peak CPU usage",
        selectedLabel: "Selected CPU sample",
        caption: "1-second samples · missing samples are gaps",
        max: 100,
        empty: "Waiting for measured CPU samples",
      },
    );
    renderTimeSeries(
      get("memory-chart"),
      systemSeries(history, seconds, "memoryPercent"),
      "average",
      {
        id: "system-memory",
        unit: "%",
        label: "Inspect whole-machine non-free RAM",
        peakLabel: "Peak non-free RAM",
        selectedLabel: "Selected RAM sample",
        caption: "1-second samples · not memory pressure",
        max: 100,
        empty: "Waiting for measured RAM samples",
      },
    );
    const cores = get("cores");
    cores.replaceChildren();
    if (latest) {
      get("cpu-model").textContent =
        `${latest.cpuModel} · ${latest.cores.length} logical cores`;
      latest.cores.forEach((usage, i) => {
        const item = el("div", "", "system-core-card");
        const level =
          usage === null
            ? "unknown"
            : usage >= 80
              ? "high"
              : usage >= 50
                ? "moderate"
                : "normal";
        item.dataset.load = level;
        const header = el("div", "", "system-core-header");
        const name = el("span", "", "system-core-name");
        name.append(
          icon("cpu"),
          el("span", `CPU ${String(i + 1).padStart(2, "0")}`),
        );
        header.append(
          name,
          el(
            "span",
            usage === null
              ? "Warming up"
              : level === "high"
                ? "High load"
                : level === "moderate"
                  ? "Moderate"
                  : "Normal",
            "system-core-state",
          ),
        );
        const value = el("div", "", "system-core-value");
        value.append(
          el("strong", usage === null ? "—" : usage.toFixed(1)),
          el("span", "%"),
        );
        const track = el("div", "", "system-core-track");
        if (usage !== null) {
          track.setAttribute("role", "progressbar");
          track.setAttribute("aria-label", `CPU ${i + 1} usage`);
          track.setAttribute("aria-valuemin", "0");
          track.setAttribute("aria-valuemax", "100");
          track.setAttribute("aria-valuenow", String(usage));
        } else
          track.setAttribute(
            "aria-label",
            `CPU ${i + 1}: waiting for a measured sample`,
          );
        const fill = el("span", "", "system-core-fill");
        fill.style.width = `${usage ?? 0}%`;
        track.append(fill);
        item.append(header, value, track);
        cores.append(item);
      });
    } else {
      get("cpu-model").textContent = "Waiting for system data";
      cores.append(el("p", "No samples collected yet.", "ov-no-values"));
    }
  }
  async function poll() {
    if (!visible || paused) return;
    if (busy) {
      timer = setTimeout(() => void poll(), 250);
      return;
    }
    busy = true;
    const epoch = generation;
    try {
      let value: unknown;
      if (native)
        value = await invoke("sample_system_metrics", { resetBaseline: reset });
      else {
        abort = new AbortController();
        const timeout = setTimeout(() => abort?.abort(), 5000);
        try {
          const response = await fetch(
            `/__edith_system/snapshot${reset ? "?reset=1" : ""}`,
            { signal: abort.signal, cache: "no-store" },
          );
          if (
            !response.ok ||
            !response.headers.get("content-type")?.includes("application/json")
          )
            throw new Error(
              "System metrics are unavailable. Use the desktop app or the EDITH development server.",
            );
          value = await response.json();
        } finally {
          clearTimeout(timeout);
        }
      }
      if (epoch !== generation) return;
      if (!validSystemSample(value))
        throw new Error("The system metrics provider returned invalid data.");
      history = retainSamples(history, value);
      error = "";
      reset = false;
    } catch (reason) {
      if (epoch === generation)
        error = reason instanceof Error ? reason.message : String(reason);
    } finally {
      busy = false;
      if (epoch === generation && visible && !paused) {
        draw();
        timer = setTimeout(() => void poll(), 1000);
      }
    }
  }
  function stop() {
    generation++;
    clearTimeout(timer);
    abort?.abort();
  }
  function start() {
    stop();
    reset = true;
    if (!busy) void poll();
    else timer = setTimeout(() => void poll(), 1000);
  }
  get("pause").onclick = () => {
    paused = !paused;
    if (paused) stop();
    else if (visible) start();
    draw();
  };
  get("clear").onclick = () => {
    history = [];
    draw();
  };
  get<HTMLSelectElement>("window").onchange = (e) => {
    seconds = Number((e.target as HTMLSelectElement).value);
    draw();
  };
  const observer = new ResizeObserver(() => {
    if (visible) draw();
  });
  observer.observe(get("cpu-chart"));
  observer.observe(get("memory-chart"));
  window.addEventListener("beforeunload", stop);
  draw();
  return {
    setVisible(value: boolean) {
      visible = value;
      if (visible && !paused) start();
      else stop();
      draw();
    },
  };
}
