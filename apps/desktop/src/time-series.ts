import type { Bucket } from "./overview-model";
type Metric = "count" | "average";
export interface SeriesOptions {
  id?: string;
  unit?: string;
  label?: string;
  peakLabel?: string;
  selectedLabel?: string;
  caption?: string;
  max?: number;
  empty?: string;
}
const rendered = new WeakMap<HTMLElement, string>();
function element<K extends keyof HTMLElementTagNameMap>(
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
  node.textContent = text;
  return node;
}
function time(value: number) {
  return new Date(value).toLocaleTimeString("en-GB", { hour12: false });
}
function format(value: number, metric: Metric) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: metric === "count" ? 0 : value < 10 ? 2 : 1,
  });
}
function ceiling(value: number) {
  if (value <= 0) return 1;
  const scale = 10 ** Math.floor(Math.log10(value)),
    fraction = value / scale;
  return (
    scale * (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10)
  );
}
function smooth(points: Array<[number, number]>) {
  if (!points.length) return "";
  let result = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1],
      [x1, y1] = points[i],
      dx = (x1 - x0) / 3;
    result += ` C${x0 + dx},${y0} ${x1 - dx},${y1} ${x1},${y1}`;
  }
  return result;
}
export function renderTimeSeries(
  container: HTMLElement,
  buckets: Bucket[],
  metric: Metric,
  options: SeriesOptions = {},
) {
  const width = Math.max(260, container.clientWidth),
    height = 250,
    left = 48,
    right = 18,
    top = 18,
    bottom = 35,
    base = height - bottom,
    plotWidth = width - left - right,
    plotHeight = base - top;
  const unitLabel = options.unit || (metric === "count" ? "requests" : "ms");
  const peakLabel =
    options.peakLabel ||
    (metric === "count" ? "Peak requests per bucket" : "Peak bucket mean");
  const signature = JSON.stringify([width, metric, buckets, options]);
  if (rendered.get(container) === signature) return;
  rendered.set(container, signature);
  const previous = container.querySelector<HTMLInputElement>("input");
  const hadFocus = !!previous && document.activeElement === previous;
  const previousIndex = previous ? Number(previous.value) : -1;
  const valid = buckets
    .map((b) => b[metric])
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const hasData =
      buckets.some((b) => b.count > 0) &&
      (metric === "count" || valid.length > 0),
    peak = valid.length && hasData ? Math.max(...valid) : null;
  const target = (peak || 1) * 1.08,
    step = ceiling(target / 4);
  const max =
    options.max ??
    (metric === "count" && peak !== null && peak < 4
      ? Math.max(1, peak)
      : step * Math.ceil(target / step));
  const x = (index: number) =>
      left + ((index + 0.5) / Math.max(1, buckets.length)) * plotWidth,
    y = (value: number) => base - (value / max) * plotHeight;
  const wrapper = element("div", "", `ts-chart ts-${metric}`);
  const readout = element("div", "", "ts-readout");
  const primary = element("div", "", "ts-primary");
  const value = element("strong", peak === null ? "—" : format(peak, metric));
  const unit = element("span", unitLabel);
  primary.append(value, unit);
  const context = element("div", "", "ts-context");
  const contextTitle = element("span", peakLabel);
  const contextTime = element(
    "small",
    buckets.length
      ? `${time(buckets[0].start)} – ${time(buckets[buckets.length - 1].end)}`
      : "Waiting for samples",
  );
  context.append(contextTitle, contextTime);
  readout.append(primary, context);
  wrapper.append(readout);
  const figure = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label":
      options.label ||
      (metric === "count"
        ? "Request count over time. Use the time bucket slider for exact values."
        : "Mean response duration over time in milliseconds. Gaps indicate no measured requests."),
  });
  figure.append(
    svg(
      "title",
      {},
      options.label ||
        (metric === "count"
          ? "HTTP request activity"
          : "HTTP mean response duration"),
    ),
    svg(
      "desc",
      {},
      "Curves connect bucket measurements without overshoot. Values between buckets are visual interpolation, not additional measurements.",
    ),
  );
  const id = `edith-${options.id || metric}-area`;
  const defs = svg("defs");
  const gradient = svg("linearGradient", {
    id,
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1",
  });
  gradient.append(
    svg("stop", {
      offset: "0%",
      "stop-color": "currentColor",
      "stop-opacity": ".21",
    }),
    svg("stop", {
      offset: "100%",
      "stop-color": "currentColor",
      "stop-opacity": ".005",
    }),
  );
  defs.append(gradient);
  figure.append(defs);
  const ticks = [
    ...new Set(
      [0, 1, 2, 3, 4].map((i) =>
        metric === "count" ? Math.round((max * i) / 4) : (max * i) / 4,
      ),
    ),
  ];
  ticks.forEach((tick) => {
    figure.append(
      svg("line", {
        x1: left,
        y1: y(tick),
        x2: width - right,
        y2: y(tick),
        class: tick === 0 ? "ts-baseline" : "ts-grid",
      }),
      svg(
        "text",
        {
          x: left - 11,
          y: y(tick) + 4,
          "text-anchor": "end",
          class: "ts-axis",
        },
        format(tick, metric),
      ),
    );
  });
  if (!hasData) {
    figure.append(
      svg(
        "text",
        {
          x: left + plotWidth / 2,
          y: top + plotHeight / 2,
          "text-anchor": "middle",
          class: "ts-empty",
        },
        options.empty || "Waiting for HTTP activity",
      ),
    );
    wrapper.append(
      figure,
      element(
        "div",
        options.empty || "Connect an app, start the proxy, or load a demo.",
        "ts-footer",
      ),
    );
    container.replaceChildren(wrapper);
    return;
  }
  const segments: Array<Array<[number, number]>> = [];
  let segment: Array<[number, number]> = [];
  buckets.forEach((bucket, index) => {
    const v = bucket[metric];
    if (v === null || !Number.isFinite(v)) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else segment.push([x(index), y(v)]);
  });
  if (segment.length) segments.push(segment);
  segments.forEach((points) => {
    const line = smooth(points);
    if (points.length > 1) {
      figure.append(
        svg("path", {
          d: `${line} L${points[points.length - 1][0]},${base} L${points[0][0]},${base} Z`,
          fill: `url(#${id})`,
          class: "ts-area",
        }),
        svg("path", { d: line, class: "ts-series", fill: "none" }),
      );
    } else
      figure.append(
        svg("circle", {
          cx: points[0][0],
          cy: points[0][1],
          r: 3,
          class: "ts-single-point",
        }),
      );
  });
  const indices = [0, Math.floor(buckets.length / 2), buckets.length - 1];
  indices.forEach((index, i) =>
    figure.append(
      svg(
        "text",
        {
          x: i === 0 ? left : i === 2 ? width - right : x(index),
          y: height - 10,
          "text-anchor": i === 0 ? "start" : i === 2 ? "end" : "middle",
          class: "ts-axis",
        },
        time(i === 2 ? buckets[index].end : buckets[index].start),
      ),
    ),
  );
  const hover = svg("g", {
    class: "ts-hover",
    visibility: "hidden",
    "pointer-events": "none",
  });
  const guide = svg("line", {
    x1: left,
    x2: left,
    y1: top,
    y2: base,
    class: "ts-guide",
  });
  const halo = svg("circle", { r: 8, class: "ts-halo" });
  const dot = svg("circle", { r: 4, class: "ts-dot" });
  const box = svg("g");
  box.append(
    svg("rect", { width: 170, height: 49, rx: 6, class: "ts-tip-box" }),
  );
  const tipTime = svg("text", { x: 11, y: 18, class: "ts-tip-time" }),
    tipValue = svg("text", { x: 11, y: 36, class: "ts-tip-value" });
  box.append(tipTime, tipValue);
  hover.append(guide, halo, dot, box);
  figure.append(hover);
  const controls = element("div", "", "ts-controls");
  const slider = element("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = String(buckets.length - 1);
  slider.step = "1";
  slider.value = String(
    hadFocus && previousIndex >= 0
      ? Math.min(previousIndex, buckets.length - 1)
      : buckets.length - 1,
  );
  slider.setAttribute(
    "aria-label",
    options.label ||
      (metric === "count"
        ? "Inspect request activity time bucket"
        : "Inspect response time bucket"),
  );
  const hint = element(
    "span",
    options.caption ||
      (metric === "count"
        ? "24 time buckets · hover to inspect"
        : "Bucket means · gaps indicate no measurements"),
  );
  controls.append(hint, slider);
  let pinned = false;
  function inspect(index: number) {
    const bucket = buckets[index],
      v = bucket[metric];
    slider.value = String(index);
    const label =
      v === null ? "No measurements" : `${format(v, metric)} ${unitLabel}`;
    value.textContent = v === null ? "—" : format(v, metric);
    contextTitle.textContent =
      v === null
        ? "No measurements in this bucket"
        : metric === "count"
          ? "Selected bucket"
          : options.selectedLabel || "Selected bucket mean";
    contextTime.textContent = `${time(bucket.start)} – ${time(bucket.end)}`;
    slider.setAttribute(
      "aria-valuetext",
      `${contextTime.textContent}: ${label}`,
    );
    const cx = x(index);
    guide.setAttribute("x1", String(cx));
    guide.setAttribute("x2", String(cx));
    const cy = v === null ? base : y(v);
    for (const marker of [halo, dot]) {
      marker.setAttribute("cx", String(cx));
      marker.setAttribute("cy", String(cy));
      marker.setAttribute("visibility", v === null ? "hidden" : "visible");
    }
    tipTime.textContent = contextTime.textContent;
    tipValue.textContent = label;
    const tx = Math.max(left, Math.min(width - right - 170, cx - 85)),
      ty = Math.max(top, Math.min(base - 54, cy - 65));
    box.setAttribute("transform", `translate(${tx},${ty})`);
    hover.setAttribute("visibility", "visible");
  }
  function reset() {
    if (pinned || document.activeElement === slider) return;
    hover.setAttribute("visibility", "hidden");
    value.textContent = peak === null ? "—" : format(peak, metric);
    contextTitle.textContent = peakLabel;
    contextTime.textContent = `${time(buckets[0].start)} – ${time(buckets[buckets.length - 1].end)}`;
  }
  const hit = svg("rect", {
    x: left,
    y: top,
    width: plotWidth,
    height: plotHeight,
    fill: "transparent",
    class: "ts-hit",
  });
  function pointerIndex(event: PointerEvent) {
    const bounds = figure.getBoundingClientRect();
    const local = ((event.clientX - bounds.left) * width) / bounds.width;
    return Math.max(
      0,
      Math.min(
        buckets.length - 1,
        Math.floor(((local - left) / plotWidth) * buckets.length),
      ),
    );
  }
  hit.onpointermove = (event) => {
    if (!pinned) inspect(pointerIndex(event));
  };
  hit.onpointerleave = reset;
  hit.onpointerdown = (event) => {
    pinned = !pinned;
    inspect(pointerIndex(event));
  };
  slider.oninput = () => inspect(Number(slider.value));
  slider.onfocus = () => inspect(Number(slider.value));
  slider.onblur = () => {
    pinned = false;
    reset();
  };
  slider.onkeydown = (event) => {
    if (event.key === "Escape") {
      pinned = false;
      slider.blur();
      reset();
    }
  };
  figure.append(hit);
  wrapper.append(figure, controls);
  container.replaceChildren(wrapper);
  if (hadFocus) {
    slider.focus({ preventScroll: true });
    inspect(Number(slider.value));
  }
}
