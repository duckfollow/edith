import { icon, iconMarkup, mountIcons, setIconLabel } from "./icons";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  appendBounded,
  BUFFER_LIMIT,
  bytes,
  matches,
  samplePacket,
} from "./model";
import type { Filters, Packet } from "./model";

interface NetworkInterface {
  name: string;
  description: string | null;
  addresses: string[];
}
export function mountPacketTool(root: HTMLElement) {
  root.innerHTML = `
  <aside class="sidebar">
    <div class="brand"><span class="brand-mark">E</span> EDITH <span class="version">α</span></div>
    <div class="workspace"><span class="dot"></span> LOCAL WORKSPACE</div>
    <p class="section-label">NETWORK EXPLORER</p>
    <button class="nav-item active" id="all-traffic">${iconMarkup("arrows")} <span>All traffic</span><span class="badge" id="side-count">0</span></button>
    <div class="source-heading"><p class="section-label">INTERFACES</p><button id="refresh" aria-label="Refresh interfaces">${iconMarkup("refresh")}</button></div>
    <div id="interfaces" aria-live="polite"></div>
    <button class="sample-source" id="sample-source"><span class="dot amber"></span><span>Sample network<small>Generated packets · sample0</small></span></button>
    <div class="sidebar-bottom"><span class="shield">${iconMarkup("shield")}</span><div>Private by design<small>All data stays on this device</small></div></div>
  </aside>
  <main>
    <header class="topbar"><div><div class="eyebrow">YOUR MACHINE. YOUR TRAFFIC.</div><h1>Network activity</h1></div><div class="header-actions"><button id="export">${iconMarkup("download")} Export JSON</button><button id="start" class="primary">${iconMarkup("play")} Start sample</button></div></header>
    <div class="notice"><span class="notice-icon">${iconMarkup("info")}</span><div><strong>Sample mode</strong><span>Explore generated traffic. Real network capture is not connected in this milestone.</span></div></div>
    <section class="stats" aria-label="Session traffic totals">
      <div><span>${iconMarkup("arrowDown")} Received</span><strong id="received">0 B</strong><small>Sample session total</small></div>
      <div><span>${iconMarkup("arrowUp")} Sent</span><strong id="sent">0 B</strong><small>Sample session total</small></div>
      <div><span>Packets generated</span><strong id="total">0</strong><small id="buffer">Up to 1,500 retained</small></div>
      <div><span>Capture status</span><strong id="status">Ready</strong><small id="session-label">Click Start sample to explore</small></div>
    </section>
    <div class="explorer">
      <section class="stream" aria-label="Packet explorer">
        <div class="stream-title"><h2>Packets <span id="match-count">0</span></h2><div><button id="pause" disabled>${iconMarkup("pause")} Pause view</button><button id="clear">${iconMarkup("clear")} Clear</button></div></div>
        <div class="filters"><label class="search"><span>${iconMarkup("search")}</span><input id="search" type="search" placeholder="Search address, port, or packet info…" aria-label="Search packets"></label><select id="protocol" aria-label="Protocol"><option value="all">All protocols</option><option>TCP</option><option>UDP</option><option>DNS</option><option>TLS</option><option>ICMP</option></select><select id="direction" aria-label="Direction"><option value="all">All directions</option><option value="inbound">Inbound</option><option value="outbound">Outbound</option><option value="local">Local</option><option value="unknown">Unknown</option></select></div>
        <div class="table-scroll"><table><thead><tr><th>TIME</th><th>DIR</th><th>SOURCE → DESTINATION</th><th>PROTOCOL</th><th class="right">SIZE</th></tr></thead><tbody id="packets"></tbody></table><div id="empty" class="empty"><span>${iconMarkup("arrows")}</span><h3>Your network, in focus.</h3><p>Start a sample session to explore packets.<br>No network traffic is being captured.</p></div></div>
        <div class="stream-footer"><span id="view-status">Sample generator stopped</span><span id="evicted">0 rows evicted</span></div>
      </section>
      <aside class="details" aria-label="Selected packet details"><div class="detail-heading"><h2>Packet details</h2><span>${iconMarkup("external")}</span></div><div id="detail-content"><div class="detail-empty">Select a packet<div>Inspect endpoints, protocol,<br>and captured metadata.</div></div></div></aside>
    </div>
    <footer><span><span class="dot amber"></span> Sample data only</span><span>Local-first · Open source · No account required</span></footer>
    <div class="message" id="message" role="status" hidden></div>
  </main>`;

  function el<T extends HTMLElement = HTMLElement>(selector: string) {
    return root.querySelector<T>(selector)!;
  }
  function text(selector: string, value: string) {
    el(selector).textContent = value;
  }
  let packets: Packet[] = [],
    frozen: Packet[] | null = null;
  let running = false,
    counter = 0,
    evicted = 0,
    received = 0,
    sent = 0;
  let selectedId: number | null = null,
    sessionId = crypto.randomUUID();
  let timer: ReturnType<typeof setInterval> | undefined;
  let messageTimer: ReturnType<typeof setTimeout> | undefined;
  const filters: Filters = { query: "", protocol: "all", direction: "all" };
  function notify(message: string) {
    clearTimeout(messageTimer);
    text("#message", message);
    el("#message").hidden = false;
    messageTimer = setTimeout(() => {
      el("#message").hidden = true;
    }, 7000);
  }
  function endpoint(address: string, port: number | null) {
    return port === null
      ? address
      : `${address.includes(":") ? `[${address}]` : address}:${port}`;
  }
  function label(tag: string, content: string, className = "") {
    const node = document.createElement(tag);
    node.textContent = content;
    node.className = className;
    return node;
  }
  function details(packet: Packet | undefined) {
    const container = el("#detail-content");
    container.replaceChildren();
    if (!packet) {
      container.append(
        label(
          "p",
          selectedId === null
            ? "Select a packet to inspect its metadata."
            : "This packet left the buffer. Select another packet.",
          "detail-empty",
        ),
      );
      return;
    }
    container.append(
      label(
        "span",
        packet.protocol,
        `protocol ${packet.protocol.toLowerCase()}`,
      ),
      label("h3", packet.summary),
      label("p", `Sample packet #${packet.id}`, "muted"),
    );
    const definition = document.createElement("dl");
    const fields: Array<[string, string]> = [
      ["Timestamp", packet.timestamp],
      ["Direction", packet.direction],
      ["Interface", packet.interfaceId],
      ["Source", endpoint(packet.sourceAddress, packet.sourcePort)],
      [
        "Destination",
        endpoint(packet.destinationAddress, packet.destinationPort),
      ],
      ["Wire length", `${packet.wireLength} bytes`],
      ["Captured length", `${packet.capturedLength} bytes`],
    ];
    fields.forEach(([name, value]) =>
      definition.append(label("dt", name), label("dd", value)),
    );
    container.append(
      definition,
      label("h4", "RAW METADATA"),
      label("pre", JSON.stringify(packet, null, 2)),
      label(
        "p",
        "Generated metadata only. Encrypted content is not decrypted by packet capture.",
        "detail-note",
      ),
    );
  }
  function render() {
    const visible = (frozen ?? packets).filter((packet) =>
      matches(packet, filters),
    );
    const tbody = el("#packets");
    const fragment = document.createDocumentFragment();
    // Limit rendered rows independently of the retained buffer to keep updates responsive.
    visible
      .slice(-250)
      .reverse()
      .forEach((packet) => {
        const tr = document.createElement("tr");
        tr.className = selectedId === packet.id ? "selected" : "";
        const timestamp = label(
          "td",
          new Date(packet.timestamp).toLocaleTimeString("en-GB", {
            hour12: false,
          }) +
            "." +
            packet.timestamp.slice(20, 23),
          "time",
        );
        const dir = label("td", "", `direction ${packet.direction}`);
        dir.append(
          icon(
            packet.direction === "inbound"
              ? "arrowDown"
              : packet.direction === "outbound"
                ? "arrowUp"
                : "arrows",
          ),
        );
        dir.setAttribute("aria-label", packet.direction);
        const endpoints = document.createElement("td");
        const select = document.createElement("button");
        select.className = "packet-select";
        select.setAttribute("aria-pressed", String(selectedId === packet.id));
        select.append(
          label(
            "span",
            `${endpoint(packet.sourceAddress, packet.sourcePort)} → ${endpoint(packet.destinationAddress, packet.destinationPort)}`,
          ),
          label("small", packet.summary),
        );
        select.onclick = () => {
          selectedId = packet.id;
          render();
        };
        endpoints.append(select);
        const protocol = document.createElement("td");
        protocol.append(
          label(
            "span",
            packet.protocol,
            `protocol ${packet.protocol.toLowerCase()}`,
          ),
        );
        tr.append(
          timestamp,
          dir,
          endpoints,
          protocol,
          label("td", bytes(packet.wireLength), "right size"),
        );
        fragment.append(tr);
      });
    tbody.replaceChildren(fragment);
    el("#empty").hidden = visible.length > 0;
    if (!visible.length) {
      text(
        "#empty h3",
        (frozen ?? packets).length
          ? "No matching packets"
          : "Your network, in focus.",
      );
      text(
        "#empty p",
        (frozen ?? packets).length
          ? "Try another address, protocol, or direction."
          : "Start a sample session. No network traffic is being captured.",
      );
    }
    text("#match-count", `${visible.length.toLocaleString()}`);
    text("#side-count", `${packets.length}`);
    text("#received", bytes(received));
    text("#sent", bytes(sent));
    text("#total", counter.toLocaleString());
    text("#status", running ? "Generating" : counter ? "Stopped" : "Ready");
    text(
      "#session-label",
      running
        ? "Simulated traffic · not live capture"
        : "Start sample to generate more",
    );
    text(
      "#buffer",
      `${packets.length.toLocaleString()} / ${BUFFER_LIMIT.toLocaleString()} retained`,
    );
    text("#evicted", `${evicted.toLocaleString()} rows evicted`);
    text(
      "#view-status",
      `${frozen ? "View paused · " : ""}${running ? "Sample generator running" : "Sample generator stopped"} · newest 250 matches shown`,
    );
    setIconLabel(
      el("#pause"),
      frozen ? "play" : "pause",
      frozen ? "Resume view" : "Pause view",
    );
    el<HTMLButtonElement>("#pause").disabled = !packets.length;
    setIconLabel(
      el("#start"),
      running ? "stop" : "play",
      running ? "Stop sample" : "Start sample",
    );
    details((frozen ?? packets).find((packet) => packet.id === selectedId));
  }
  function generate(count: number) {
    const incoming = Array.from({ length: count }, () =>
      samplePacket(++counter, sessionId),
    );
    incoming.forEach((p) => {
      if (p.direction === "inbound") received += p.wireLength;
      if (p.direction === "outbound") sent += p.wireLength;
    });
    const next = appendBounded(packets, incoming);
    packets = next.packets;
    evicted += next.evicted;
    render();
  }
  el("#start").onclick = () => {
    if (running) {
      clearInterval(timer);
      running = false;
      render();
      return;
    }
    running = true;
    generate(10);
    timer = setInterval(() => generate(3), 1000);
  };
  el("#pause").onclick = () => {
    frozen = frozen ? null : packets.slice();
    render();
  };
  el("#clear").onclick = () => {
    packets = [];
    frozen = null;
    counter = evicted = received = sent = 0;
    selectedId = null;
    sessionId = crypto.randomUUID();
    render();
  };
  el<HTMLInputElement>("#search").oninput = (event) => {
    filters.query = (event.target as HTMLInputElement).value;
    render();
  };
  el<HTMLSelectElement>("#protocol").onchange = (event) => {
    filters.protocol = (event.target as HTMLSelectElement).value;
    render();
  };
  el<HTMLSelectElement>("#direction").onchange = (event) => {
    filters.direction = (event.target as HTMLSelectElement).value;
    render();
  };
  el("#all-traffic").onclick = () => {
    filters.query = "";
    filters.direction = filters.protocol = "all";
    el<HTMLInputElement>("#search").value = "";
    el<HTMLSelectElement>("#protocol").value = "all";
    el<HTMLSelectElement>("#direction").value = "all";
    render();
  };
  el("#sample-source").onclick = () =>
    notify(
      "Sample mode generates metadata locally. It does not inspect your network.",
    );
  el("#export").onclick = () => {
    const snapshot = (frozen ?? packets).filter((packet) =>
      matches(packet, filters),
    );
    if (!snapshot.length) {
      notify("No matching packets to export.");
      return;
    }
    const blob = new Blob(
      [
        JSON.stringify(
          {
            mode: "sample",
            formatVersion: 1,
            exportedAt: new Date().toISOString(),
            packets: snapshot,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "edith-sample-packets.json";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(
      `Export requested for ${snapshot.length} sample packets. This is JSON metadata, not a PCAP capture.`,
    );
  };
  async function discover() {
    const container = el("#interfaces");
    container.replaceChildren(
      label("p", "Checking interfaces…", "interface-note"),
    );
    if (!isTauri()) {
      container.replaceChildren(
        label(
          "p",
          "Open the desktop app to discover local interfaces. Browser preview uses sample data.",
          "interface-note",
        ),
      );
      return;
    }
    el<HTMLButtonElement>("#refresh").disabled = true;
    try {
      const interfaces = await invoke<NetworkInterface[]>("list_interfaces");
      container.replaceChildren();
      if (!interfaces.length)
        container.append(
          label(
            "p",
            "No interfaces found. Check capture permissions.",
            "interface-note",
          ),
        );
      interfaces.forEach((item) => {
        const node = document.createElement("button");
        node.className = "native-interface";
        node.append(
          label("strong", item.description || item.name),
          label("small", item.addresses.join(", ") || item.name),
        );
        node.onclick = () =>
          notify(
            `${item.name}: discovered only. Real capture requires the upcoming capture helper.`,
          );
        container.append(node);
      });
      container.append(
        label(
          "p",
          "Discovery only · live capture not yet available",
          "interface-note",
        ),
      );
    } catch (error) {
      container.replaceChildren(
        label("p", String(error), "interface-note error"),
      );
    } finally {
      el<HTMLButtonElement>("#refresh").disabled = false;
    }
  }
  el("#refresh").onclick = () => void discover();
  window.addEventListener("beforeunload", () => {
    clearInterval(timer);
    clearTimeout(messageTimer);
  });
  mountIcons(root);
  render();
  void discover();
}
