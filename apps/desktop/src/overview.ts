import { icon, prependIcon } from "./icons";
import type { HttpEntry, LogEntry } from "./debug-model";
import { summarize } from "./overview-model";
import type { OverviewWindow, Bucket } from "./overview-model";
interface Data {
  requests: HttpEntry[];
  logs: LogEntry[];
  networkSource: string;
  logSource: string;
}
interface Actions {
  network: (method?: string, status?: string) => void;
  logs: () => void;
  demo: () => void;
}
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  cls = "",
) {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = cls;
  return node;
}
function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  text = "",
) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs))
    node.setAttribute(key, String(value));
  if (text) node.textContent = text;
  return node;
}
function clock(time: number) {
  return new Date(time).toLocaleTimeString("en-GB", { hour12: false });
}
export function mountOverview(root: HTMLElement, actions: Actions) {
  root.innerHTML = `<div class="ov-header"><div><div class="wb-eyebrow">WORKSPACE HEALTH</div><h1>Overview</h1><p>Requests, response times, and application logs at a glance.</p></div><div class="ov-actions"><button data-ov="demo">Load overview demo</button><select data-ov="window" aria-label="Overview time window"><option value="all">All retained</option><option value="60s">Latest 60 seconds</option><option value="5m">Latest 5 minutes</option></select></div></div><div class="ov-sources"><span data-ov="network-source"></span><span data-ov="log-source"></span></div><p class="ov-scope">Retained Network & Logs data, independent of table filters. CONNECT tunnels are counted separately. Time windows end at the latest recorded event.</p><div class="ov-metrics"></div><div class="ov-charts"><section class="ov-chart"><div class="ov-chart-heading"><h2>Request activity</h2><span>Requests per bucket</span></div><div data-ov="activity" class="ov-plot"></div></section><section class="ov-chart"><div class="ov-chart-heading"><h2>Response time</h2><span>Mean duration per bucket · ms</span></div><div data-ov="latency" class="ov-plot"></div></section></div><div class="ov-breakdowns"><section class="ov-chart"><div class="ov-chart-heading"><h2>HTTP status</h2><span>Click to inspect</span></div><div data-ov="statuses"></div></section><section class="ov-chart"><div class="ov-chart-heading"><h2>Request methods</h2><span>Click to inspect</span></div><div data-ov="methods"></div></section></div><div class="ov-footer"><span data-ov="coverage"></span><button data-ov="network">Open Network</button><button data-ov="logs">Open Logs</button></div>`;
  function get<T extends HTMLElement = HTMLElement>(name: string) {
    return root.querySelector<T>(`[data-ov="${name}"]`)!;
  }
  prependIcon(get("demo"), "demo");
  prependIcon(get("network"), "network");
  prependIcon(get("logs"), "logs");
  get("demo").onclick = actions.demo;
  get("network").onclick = () => actions.network();
  get("logs").onclick = actions.logs;
  let window: OverviewWindow = "all";
  let current: Data = {
    requests: [],
    logs: [],
    networkSource: "No file loaded",
    logSource: "No file loaded",
  };
  get<HTMLSelectElement>("window").onchange = (e) => {
    window = (e.target as HTMLSelectElement).value as OverviewWindow;
    render();
  };
  function chart(
    container: HTMLElement,
    buckets: Bucket[],
    metric: "count" | "average",
  ) {
    const width = Math.max(250, container.clientWidth),
      height = 225,
      left = 48,
      right = 15,
      top = 18,
      bottom = 38;
    const figure = svg("svg", {
      viewBox: `0 0 ${width} ${height}`,
      role: "img",
      "aria-label":
        metric === "count"
          ? "HTTP requests over time"
          : "Mean HTTP duration over time in milliseconds",
    });
    figure.append(
      svg(
        "title",
        {},
        metric === "count"
          ? "HTTP request count per time bucket"
          : "Mean duration per time bucket. Gaps indicate no measured requests.",
      ),
    );
    const values = buckets
      .map((b) => b[metric])
      .filter((v): v is number => v !== null);
    const maximum = Math.max(1, ...values),
      ceiling =
        metric === "count"
          ? Math.max(1, Math.ceil(maximum))
          : Math.max(1, Math.ceil(maximum / 10) * 10);
    const plotWidth = width - left - right,
      plotHeight = height - top - bottom;
    const ticks =
      metric === "count"
        ? [
            ...new Set([
              0,
              Math.round(ceiling / 3),
              Math.round((ceiling * 2) / 3),
              ceiling,
            ]),
          ]
        : [0, ceiling / 3, (ceiling * 2) / 3, ceiling];
    for (const value of ticks) {
      const y = height - bottom - (plotHeight * value) / ceiling;
      figure.append(
        svg("line", {
          x1: left,
          x2: width - right,
          y1: y,
          y2: y,
          class: "ov-grid",
        }),
        svg(
          "text",
          { x: left - 9, y: y + 4, "text-anchor": "end", class: "ov-axis" },
          metric === "count" ? String(Math.round(value)) : value.toFixed(0),
        ),
      );
    }
    figure.append(
      svg("text", { x: left, y: height - 4, class: "ov-axis" }, "Time"),
      svg(
        "text",
        { x: 4, y: 12, class: "ov-axis" },
        metric === "count" ? "Count" : "ms",
      ),
    );
    if (!buckets.length || !buckets.some((b) => b.count > 0)) {
      figure.append(
        svg(
          "text",
          {
            x: left + plotWidth / 2,
            y: height / 2,
            "text-anchor": "middle",
            class: "ov-no-data",
          },
          "No HTTP data in this window",
        ),
      );
      container.replaceChildren(figure);
      return;
    }
    const x = (i: number) => left + ((i + 0.5) / buckets.length) * plotWidth,
      y = (v: number) => height - bottom - (v / ceiling) * plotHeight;
    let path = "";
    let gap = true;
    buckets.forEach((bucket, i) => {
      const value = bucket[metric];
      if (value === null) {
        gap = true;
        return;
      }
      path += `${gap ? "M" : "L"}${x(i).toFixed(2)},${y(value).toFixed(2)} `;
      gap = false;
    });
    figure.append(
      svg("path", {
        d: path,
        fill: "none",
        class: metric === "count" ? "ov-line" : "ov-latency-line",
      }),
    );
    buckets.forEach((bucket, i) => {
      const value = bucket[metric];
      if (value === null) return;
      const point = svg("circle", {
        cx: x(i),
        cy: y(value),
        r: 3,
        class: metric === "count" ? "ov-point" : "ov-latency-point",
      });
      point.append(
        svg(
          "title",
          {},
          `${clock(bucket.start)}–${clock(bucket.end)}: ${value.toFixed(metric === "count" ? 0 : 1)} ${metric === "count" ? "requests" : "ms"}`,
        ),
      );
      figure.append(point);
    });
    for (const i of [0, Math.floor(buckets.length / 2), buckets.length - 1])
      figure.append(
        svg(
          "text",
          {
            x: i === 0 ? left : i === buckets.length - 1 ? width - right : x(i),
            y: height - 18,
            "text-anchor":
              i === 0 ? "start" : i === buckets.length - 1 ? "end" : "middle",
            class: "ov-axis",
          },
          clock(i === buckets.length - 1 ? buckets[i].end : buckets[i].start),
        ),
      );
    container.replaceChildren(figure);
  }
  function bars(
    container: HTMLElement,
    values: Array<[string, number]>,
    kind: "statuses" | "methods",
  ) {
    container.replaceChildren();
    if (!values.length) {
      container.append(
        el("p", "No HTTP requests in this window.", "ov-no-values"),
      );
      return;
    }
    const max = Math.max(...values.map(([, count]) => count));
    values.forEach(([name, count]) => {
      const button = el("button", "", "ov-bar");
      button.type = "button";
      button.setAttribute("aria-label", `Inspect ${count} ${name} requests`);
      const progress = el("progress");
      progress.max = max;
      progress.value = count;
      progress.setAttribute("aria-label", `${name} requests`);
      button.append(
        el("span", name),
        progress,
        el("strong", count.toLocaleString()),
      );
      button.onclick = () =>
        actions.network(
          kind === "methods" ? name : undefined,
          kind === "statuses"
            ? name === "Failed"
              ? "failed"
              : name
            : undefined,
        );
      container.append(button);
    });
  }
  function render() {
    const result = summarize(current.requests, current.logs, window);
    get("network-source").textContent = `Network: ${current.networkSource}`;
    get("log-source").textContent = `Logs: ${current.logSource}`;
    const metrics = root.querySelector(".ov-metrics")!;
    metrics.replaceChildren();
    const cards: Array<
      [string, string, string, "network" | "activity" | "logs"]
    > = [
      [
        "HTTP requests",
        String(result.http),
        `${result.tunnels} CONNECT tunnels excluded`,
        "network",
      ],
      [
        "HTTP failures",
        `${result.failureRate.toFixed(1)}%`,
        `${result.failure} failed / 4xx / 5xx requests`,
        "activity",
      ],
      [
        "P95 duration",
        result.p95 === null ? "—" : `${result.p95.toFixed(0)} ms`,
        result.average === null
          ? "No measured durations"
          : `Mean ${result.average.toFixed(0)} ms · source timing semantics apply`,
        "activity",
      ],
      [
        "Log errors",
        String(result.logErrors),
        `${result.logEvents} log events · ERROR + FATAL`,
        "logs",
      ],
    ];
    cards.forEach(([name, value, note, glyph]) => {
      const card = el("section", "", "ov-stat");
      const title = el("div", "", "ov-stat-label");
      title.append(icon(glyph), el("span", name));
      card.append(title, el("strong", value), el("small", note));
      metrics.append(card);
    });
    chart(get("activity"), result.buckets, "count");
    chart(get("latency"), result.buckets, "average");
    bars(get("statuses"), result.statuses, "statuses");
    bars(get("methods"), result.methods, "methods");
    get("coverage").textContent =
      `Summary of retained records only${result.latest !== null ? ` · latest event ${new Date(result.latest).toLocaleString()}` : ""}${result.undated ? " · Some HTTP records have no valid timestamp and are omitted from charts" : ""}. SDK duration ends at headers; proxy/HAR durations may cover full transfer. Breakdown links open all retained matches in Network.`;
  }
  const observer = new ResizeObserver(() => {
    if (!root.hidden) render();
  });
  observer.observe(get("activity"));
  observer.observe(get("latency"));
  render();
  return {
    update(data: Data) {
      current = data;
      if (!root.hidden) render();
    },
    render,
  };
}
