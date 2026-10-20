import { renderTimeSeries } from "./time-series";
import { icon, prependIcon } from "./icons";
import type { HttpEntry, LogEntry } from "./debug-model";
import { activityCalendar, summarize } from "./overview-model";
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
export function mountOverview(root: HTMLElement, actions: Actions) {
  root.innerHTML = `<div class="ov-header"><div><div class="wb-eyebrow">WORKSPACE HEALTH</div><h1>Overview</h1><p>Requests, response times, and application logs at a glance.</p></div><div class="ov-actions"><button data-ov="demo">Load overview demo</button><select data-ov="window" aria-label="Overview time window"><option value="all">All retained</option><option value="60s">Latest 60 seconds</option><option value="5m">Latest 5 minutes</option></select></div></div><div class="ov-sources"><span data-ov="network-source"></span><span data-ov="log-source"></span></div><p class="ov-scope">Retained Network & Logs data, independent of table filters. CONNECT tunnels are counted separately. Time windows end at the latest recorded event.</p><div class="ov-metrics"></div><section class="ov-contributions"><div class="ov-contribution-heading"><h2 data-ov="calendar-title">Request activity</h2><span data-ov="calendar-range"></span></div><div class="ov-calendar-scroll"><div class="ov-calendar-months" data-ov="calendar-months"></div><div class="ov-calendar-body"><div class="ov-calendar-weekdays" aria-hidden="true"><span></span><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span></div><div class="ov-calendar-grid" data-ov="calendar" aria-label="Daily retained HTTP requests"></div></div></div><div class="ov-calendar-footer"><span data-ov="calendar-detail" role="status">Select a day to inspect its retained count.</span><div class="ov-calendar-legend" aria-label="Activity intensity from fewer to more retained requests"><span>Less</span><i data-level="0"></i><i data-level="1"></i><i data-level="2"></i><i data-level="3"></i><i data-level="4"></i><span>More</span></div></div><p class="ov-calendar-note">365 calendar days · retained HTTP requests only, not a complete recording history. Empty cells mean no retained requests. CONNECT excluded. Independent of the time filter below.</p></section><div class="ov-charts"><section class="ov-chart"><div class="ov-chart-heading"><h2>Request activity</h2><span>Requests per bucket</span></div><div data-ov="activity" class="ov-plot"></div></section><section class="ov-chart"><div class="ov-chart-heading"><h2>Response time</h2><span>Mean duration per bucket · ms</span></div><div data-ov="latency" class="ov-plot"></div></section></div><div class="ov-breakdowns"><section class="ov-chart"><div class="ov-chart-heading"><h2>HTTP status</h2><span>Click to inspect</span></div><div data-ov="statuses"></div></section><section class="ov-chart"><div class="ov-chart-heading"><h2>Request methods</h2><span>Click to inspect</span></div><div data-ov="methods"></div></section></div><div class="ov-footer"><span data-ov="coverage"></span><button data-ov="network">Open Network</button><button data-ov="logs">Open Logs</button></div>`;
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
  let selectedDay = "";
  let calendarSignature = "";
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
    renderTimeSeries(container, buckets, metric);
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
    const total = values.reduce((sum, [, count]) => sum + count, 0);
    values.forEach(([name, count]) => {
      const button = el("button", "", "ov-bar");
      button.type = "button";
      button.setAttribute("aria-label", `Inspect ${count} ${name} requests`);
      const percent = total ? (count / total) * 100 : 0;
      const colors: Record<string, string> = {
        "2xx": "#3fb950",
        "3xx": "#58a6ff",
        "4xx": "#d29922",
        "5xx": "#f85149",
        Failed: "#f85149",
        GET: "#58a6ff",
        POST: "#3fb950",
        PUT: "#bc8cff",
        PATCH: "#d29922",
        DELETE: "#f85149",
        HEAD: "#79c0ff",
        OPTIONS: "#a5a9ff",
      };
      button.style.setProperty("--bar-color", colors[name] || "#8b949e");
      const label = el("span", "", "ov-distribution-label");
      label.append(el("i", "", "ov-distribution-dot"), el("span", name));
      const track = el("span", "", "ov-distribution-track");
      track.setAttribute("aria-hidden", "true");
      const fill = el("span", "", "ov-distribution-fill");
      fill.style.width = `${percent}%`;
      track.append(fill);
      const stats = el("span", "", "ov-distribution-stats");
      stats.append(
        el("strong", count.toLocaleString()),
        el("small", `${percent.toFixed(1)}%`),
      );
      button.setAttribute(
        "aria-label",
        `Inspect ${count} ${name} requests, ${percent.toFixed(1)} percent of this window`,
      );
      button.append(label, track, stats);
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
  function renderCalendar() {
    const calendar = activityCalendar(current.requests);
    const signature = JSON.stringify([
      calendar.days.map((d) => d.count),
      calendar.start,
      calendar.end,
    ]);
    get("calendar-title").textContent =
      `${calendar.total.toLocaleString()} retained HTTP requests in the last year`;
    get("calendar-range").textContent = `${calendar.start} — ${calendar.end}`;
    if (signature === calendarSignature) return;
    calendarSignature = signature;
    const months = get("calendar-months");
    months.replaceChildren();
    let previousMonth = -1;
    for (let week = 0; week < 53; week++) {
      const day = calendar.days[week * 7];
      const date = new Date(day.timestamp);
      const month = date.getMonth();
      const label = el(
        "span",
        month !== previousMonth
          ? date.toLocaleDateString("en", { month: "short" })
          : "",
      );
      label.className = "ov-calendar-month";
      if (
        month !== previousMonth &&
        week > 0 &&
        week < 3 &&
        months.firstElementChild
      )
        months.firstElementChild.textContent = "";
      if (week > 50) label.textContent = "";
      months.append(label);
      previousMonth = month;
    }
    const grid = get("calendar");
    const focused = grid.contains(document.activeElement)
      ? (document.activeElement as HTMLButtonElement).dataset.date
      : null;
    grid.replaceChildren();
    const days = calendar.days;
    const fragment = document.createDocumentFragment();
    const select = (key: string, count: number) => {
      selectedDay = key;
      get("calendar-detail").textContent =
        `${key}: ${count.toLocaleString()} retained HTTP request${count === 1 ? "" : "s"}`;
      grid.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
        const selected = b.dataset.date === key;
        b.setAttribute("aria-pressed", String(selected));
        b.tabIndex = selected ? 0 : -1;
      });
    };
    days.forEach((day) => {
      if (!day.inRange) {
        fragment.append(el("span", "", "ov-calendar-padding"));
        return;
      }
      const button = el("button", "", "ov-day");
      button.type = "button";
      button.dataset.level = String(day.level);
      button.dataset.date = day.key;
      button.title = `${day.key}: ${day.count} retained HTTP requests`;
      button.setAttribute("aria-label", button.title);
      button.setAttribute("aria-pressed", String(day.key === selectedDay));
      button.tabIndex = day.key === (selectedDay || calendar.end) ? 0 : -1;
      button.onclick = () => select(day.key, day.count);
      fragment.append(button);
    });
    grid.append(fragment);
    grid.onkeydown = (event) => {
      const keys: Record<string, number> = {
        ArrowLeft: -7,
        ArrowRight: 7,
        ArrowUp: -1,
        ArrowDown: 1,
      };
      if (!(event.key in keys)) return;
      const target = event.target as HTMLButtonElement;
      const buttons = [...grid.querySelectorAll<HTMLButtonElement>("button")];
      const index = buttons.indexOf(target);
      if (index < 0) return;
      event.preventDefault();
      const next =
        buttons[
          Math.max(0, Math.min(buttons.length - 1, index + keys[event.key]))
        ];
      next.focus();
      const day = days.find((d) => d.key === next.dataset.date)!;
      select(day.key, day.count);
    };
    const selected = days.find((d) => d.inRange && d.key === selectedDay);
    if (selected) select(selected.key, selected.count);
    else {
      selectedDay = "";
      const last = grid.querySelectorAll<HTMLButtonElement>("button");
      if (last.length) last[last.length - 1].tabIndex = 0;
      get("calendar-detail").textContent =
        `${calendar.activeDays} active days in retained data${calendar.undated ? ` · ${calendar.undated} undated requests omitted` : ""}`;
    }
    if (focused) {
      const target = [
        ...grid.querySelectorAll<HTMLButtonElement>("button"),
      ].find((button) => button.dataset.date === focused);
      target?.focus({ preventScroll: true });
    }
  }
  function render() {
    renderCalendar();
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
