import { workspacePolicy } from "./access-policy";
import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  GatewayCanvas,
  type DiagramNode,
  type DiagramEdge,
} from "./gateway-canvas";
import "./gateway.css";

type Route = {
  id: string;
  path: string;
  target: string;
  strip: boolean;
  enabled: boolean;
  connected: boolean;
};
type Config = { version: 1; port: number; routes: Route[] };
const key = "edith.gateway.v1";
const initial: Config = {
  version: 1,
  port: 8080,
  routes: [
    {
      id: "api",
      path: "/api",
      target: "http://localhost:3000",
      strip: true,
      enabled: true,
      connected: true,
    },
  ],
};
function validate(c: Config): string {
  if (
    !Number.isInteger(c.port) ||
    c.port < 1024 ||
    c.port > 65535 ||
    [1420, 8899].includes(c.port)
  )
    return "Choose a port from 1024–65535, excluding EDITH ports 1420 and 8899.";
  if (!c.routes.length) return "Add at least one route.";
  const paths = new Set<string>();
  for (const r of c.routes) {
    if (
      !/^\/(?:[A-Za-z0-9._~!$&'()+,;=@%-]+\/?)*$/.test(r.path) ||
      r.path.includes("..")
    )
      return "Paths must start with / and contain no query, wildcard, or .. segments.";
    if (paths.has(r.path)) return "Each route needs a unique path.";
    paths.add(r.path);
    try {
      const u = new URL(r.target);
      if (
        !["http:", "https:"].includes(u.protocol) ||
        u.username ||
        u.password ||
        u.search ||
        u.hash
      )
        throw Error();
      if (
        ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) &&
        Number(u.port || (u.protocol === "https:" ? 443 : 80)) === c.port
      )
        return "A backend cannot point back to the gateway port.";
    } catch {
      return "Enter an HTTP or HTTPS backend URL without credentials, query, or fragment.";
    }
    if (r.enabled && !r.connected)
      return "Connect every enabled route to its backend.";
  }
  return "";
}
function load(storageKey: string, port: number): Config {
  try {
    const c = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (
      c?.version === 1 &&
      Array.isArray(c.routes) &&
      c.routes.length <= 20 &&
      c.routes.every(
        (r: Route) =>
          typeof r.id === "string" &&
          typeof r.path === "string" &&
          typeof r.target === "string" &&
          typeof r.enabled === "boolean" &&
          typeof r.strip === "boolean" &&
          typeof r.connected === "boolean",
      ) &&
      !validate(c)
    )
      return c;
  } catch {
    /* Storage can be unavailable in restricted browsers. */
  }
  return { ...initial, port };
}
function Gateway({
  instanceId,
  initialPort,
  onDiagram,
  command,
}: {
  instanceId: string;
  initialPort: number;
  onDiagram: (id: string, nodes: DiagramNode[], edges: DiagramEdge[]) => void;
  command: {
    instance: string;
    node?: string;
    source?: string;
    target?: string;
    sequence: number;
  } | null;
}) {
  const storageKey = instanceId === "default" ? key : `${key}.${instanceId}`;
  const [config, setConfig] = useState<Config>(() =>
    load(storageKey, initialPort),
  );
  const [selected, setSelected] = useState(config.routes[0]?.id);
  const [notice, setNotice] = useState("");
  const [runtime, setRuntime] = useState<{
    running: boolean;
    port: number | null;
    token: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [access, setAccess] = useState(workspacePolicy);
  useEffect(() => {
    const update = () => setAccess(workspacePolicy);
    window.addEventListener("edith-access-policy", update);
    return () => window.removeEventListener("edith-access-policy", update);
  }, []);
  const [previewFlow, setPreviewFlow] = useState(false);
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      try {
        const response = await fetch(
          `/__edith_gateway/status?gateway=${instanceId}`,
          {
            signal: AbortSignal.timeout(4000),
          },
        );
        if (!response.ok) throw Error();
        const data = await response.json();
        if (
          !disposed &&
          typeof data.running === "boolean" &&
          typeof data.token === "string"
        )
          setRuntime(data);
      } catch {
        if (!disposed) setRuntime(null);
      }
    };
    void refresh();
    const timer = setInterval(refresh, 2000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);
  async function control(action: "start" | "stop") {
    if (!runtime || busy) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/__edith_gateway/${action}?gateway=${instanceId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Edith-Token": runtime.token,
          },
          body: JSON.stringify(action === "start" ? config : {}),
          signal: AbortSignal.timeout(10000),
        },
      );
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Gateway operation failed");
      setRuntime(data);
      setNotice(
        action === "start"
          ? `Gateway listening at http://127.0.0.1:${data.port}`
          : "Gateway stopped",
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Gateway operation failed",
      );
    } finally {
      setBusy(false);
    }
  }

  const [positions] = useState<Record<string, { x: number; y: number }>>({});
  useEffect(() => {
    if (!command || command.instance !== instanceId) return;
    if (command.node) {
      const r = config.routes.find(
        (r) =>
          command.node === `route-${r.id}` ||
          command.node === `backend-${r.id}`,
      );
      if (r) setSelected(r.id);
    }
    if (command.source && command.target) {
      const r = config.routes.find(
        (r) =>
          command.source === `route-${r.id}` &&
          command.target === `backend-${r.id}`,
      );
      if (r) {
        setConfig((c) => ({
          ...c,
          routes: c.routes.map((v) =>
            v.id === r.id ? { ...v, connected: true } : v,
          ),
        }));
        setNotice("Unsaved changes");
      } else setNotice("Connect a route to its matching backend.");
    }
  }, [command]);
  const route = config.routes.find((r) => r.id === selected);
  const error = validate(config);
  function update(patch: Partial<Route>) {
    setConfig((c) => ({
      ...c,
      routes: c.routes.map((r) => (r.id === selected ? { ...r, ...patch } : r)),
    }));
    setNotice("Unsaved changes");
  }
  const nodes: DiagramNode[] = [
    {
      id: "listener",
      ...(positions.listener || { x: 30, y: 140 }),
      label: `EDITH Gateway\n127.0.0.1:${config.port}`,
      kind: "listener",
      status: busy
        ? "Updating…"
        : runtime?.running
          ? `Running · :${runtime.port}`
          : runtime
            ? previewFlow
              ? "Preview only · no traffic sent"
              : "Stopped"
            : "Development runtime unavailable",
      statusTone: busy
        ? "busy"
        : runtime?.running
          ? "running"
          : previewFlow
            ? "preview"
            : "stopped",
      actions: [
        {
          label: busy ? "Please wait…" : runtime?.running ? "Stop" : "Start",
          tone: busy ? "busy" : runtime?.running ? "stop" : "start",
          icon: busy ? "refresh" : runtime?.running ? "stop" : "play",
          disabled:
            !access.manageGateway ||
            !runtime ||
            busy ||
            (!runtime.running && !!error),
          title: error || "Start or stop this Gateway",
          run: () => void control(runtime?.running ? "stop" : "start"),
        },
        {
          label: previewFlow ? "Stop preview" : "Preview flow",
          tone: "preview",
          pressed: previewFlow,
          disabled: !!runtime?.running || busy,
          run: () => setPreviewFlow((v) => !v),
        },
      ],
    },
    ...config.routes.flatMap((r, i): DiagramNode[] => [
      {
        id: `route-${r.id}`,
        ...(positions[`route-${r.id}`] || { x: 340, y: i * 150 + 40 }),
        label: `${r.enabled ? "" : "Disabled · "}${r.path}\n${r.strip ? "Strip prefix" : "Keep path"}`,
        kind: "route",
        selected: r.id === selected,
      },
      {
        id: `backend-${r.id}`,
        ...(positions[`backend-${r.id}`] || { x: 660, y: i * 150 + 40 }),
        label: r.target || "Backend URL",
        kind: "backend",
      },
    ]),
  ];
  const edges: DiagramEdge[] = config.routes.flatMap((r) => [
    {
      id: `entry-${r.id}`,
      source: "listener",
      target: `route-${r.id}`,
      animated: r.enabled && r.connected && (!!runtime?.running || previewFlow),
      color: r.enabled ? "#3fb950" : "#484f58",
    },
    ...(r.connected
      ? [
          {
            id: `target-${r.id}`,
            source: `route-${r.id}`,
            target: `backend-${r.id}`,
            color: "#58a6ff",
            animated: r.enabled && (!!runtime?.running || previewFlow),
          },
        ]
      : []),
  ]);
  useEffect(() => {
    onDiagram(instanceId, nodes, edges);
  }, [config, selected, runtime, busy, previewFlow, access, onDiagram]);
  const prefix =
    route?.path === "/" ? "" : (route?.path || "").replace(/\/$/, "");
  const exampleInput = `${prefix}/users`;
  const exampleOutput = route
    ? `${route.target.replace(/\/$/, "")}${route.strip ? "/users" : exampleInput}`
    : "";
  return (
    <div className="gw-page gw-config-panel">
      <header className="gw-config-header">
        <div>
          <p className="gw-eyebrow">SELECTED GATEWAY</p>
          <h2>
            Gateway configuration <code>:{config.port || "—"}</code>
          </h2>
          <p>Set the entry point and choose where each route goes.</p>
        </div>
        <span
          className={`gw-badge${runtime?.running ? " gw-badge-running" : ""}`}
        >
          {runtime?.running
            ? `Running · :${runtime.port}`
            : runtime
              ? "Stopped"
              : "Runtime unavailable"}
        </span>
      </header>
      <div className="gw-config-connection">
        <div>
          <label htmlFor={`port-${instanceId}`}>Listener address</label>
          <div className="gw-address-field">
            <span>127.0.0.1 :</span>
            <input
              id={`port-${instanceId}`}
              aria-label="Gateway port"
              type="number"
              min="1024"
              max="65535"
              value={config.port || ""}
              onChange={(e) => {
                setConfig({ ...config, port: Number(e.target.value) });
                setNotice("Unsaved changes");
              }}
            />
          </div>
        </div>
        <p>
          {runtime?.running
            ? "Edits apply after you stop and start this Gateway."
            : "Start this Gateway from its card in the map above."}
        </p>
        <div className="gw-save-actions">
          {" "}
          <button
            disabled={!!error}
            onClick={() => {
              try {
                localStorage.setItem(storageKey, JSON.stringify(config));
                setNotice(
                  "Configuration saved on this device. Restart Gateway to apply changes.",
                );
              } catch {
                setNotice(
                  "Cannot save in this browser. Export a copy instead.",
                );
              }
            }}
          >
            Save setup
          </button>
          <button
            disabled={!!error || !access.exportData}
            onClick={() => {
              if (!workspacePolicy.exportData) return;
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(config, null, 2)], {
                  type: "application/json",
                }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "edith-gateway.json";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Export JSON
          </button>
        </div>
      </div>
      <div className="gw-config-body">
        <aside className="gw-route-list" aria-label="Gateway routes">
          <div className="gw-route-list-heading">
            <h3>
              Routes <span>{config.routes.length}</span>
            </h3>
          </div>
          <div className="gw-route-items">
            {config.routes.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`gw-route-item${r.id === selected ? " is-selected" : ""}`}
                aria-pressed={r.id === selected}
                onClick={() => setSelected(r.id)}
              >
                <span>
                  <i className={r.enabled && r.connected ? "is-enabled" : ""} />
                  <strong>{r.path || "Untitled route"}</strong>
                </span>
                <small>{r.target || "No backend configured"}</small>
                <em>
                  {!r.enabled
                    ? "Disabled"
                    : r.connected
                      ? "Connected"
                      : "Disconnected"}
                </em>
              </button>
            ))}
          </div>
          <div className="gw-add-route">
            {" "}
            <button
              disabled={config.routes.length >= 20}
              onClick={() => {
                const id = crypto.randomUUID();
                setConfig({
                  ...config,
                  routes: [
                    ...config.routes,
                    {
                      id,
                      path: `/service-${config.routes.length + 1}`,
                      target: "http://localhost:4000",
                      enabled: true,
                      strip: true,
                      connected: true,
                    },
                  ],
                });
                setSelected(id);
                setNotice("Unsaved changes");
              }}
            >
              + Add route
            </button>
          </div>
        </aside>
        <section
          className="gw-route-editor"
          aria-label="Selected route settings"
        >
          {route ? (
            <>
              <div className="gw-editor-heading">
                <div>
                  <p className="gw-eyebrow">ROUTE SETTINGS</p>
                  <h3>{route.path || "New route"}</h3>
                </div>
                <label className="gw-toggle-label">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={route.enabled}
                    onChange={(e) => update({ enabled: e.target.checked })}
                  />
                  <span>Enabled</span>
                </label>
              </div>
              <div className="gw-editor-fields">
                <label>
                  Path prefix
                  <input
                    value={route.path}
                    onChange={(e) => update({ path: e.target.value })}
                    placeholder="/api"
                  />
                  <small>Matches this path and its subpaths.</small>
                </label>
                <label>
                  Backend URL
                  <input
                    value={route.target}
                    onChange={(e) => update({ target: e.target.value })}
                    placeholder="http://localhost:3000"
                  />
                  <small>The service that receives matching requests.</small>
                </label>
              </div>
              <label className="gw-prefix-option">
                <input
                  type="checkbox"
                  checked={route.strip}
                  onChange={(e) => update({ strip: e.target.checked })}
                />
                <span>
                  <strong>Strip path prefix</strong>
                  <small>Remove the matched prefix before forwarding.</small>
                </span>
              </label>
              <div className="gw-routing-example">
                <span>REQUEST PREVIEW</span>
                <div>
                  <code>{exampleInput}</code>
                  <b aria-hidden="true">→</b>
                  <code>{exampleOutput}</code>
                </div>
              </div>
              <div className="gw-route-actions">
                {" "}
                <button
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent("edith-gateway-view", {
                        detail: {
                          gatewayId: instanceId,
                          path:
                            route.path === "/"
                              ? "/"
                              : route.path.replace(/\/$/, ""),
                        },
                      }),
                    )
                  }
                >
                  View requests
                </button>
                <button onClick={() => update({ connected: !route.connected })}>
                  {route.connected ? "Disconnect backend" : "Connect backend"}
                </button>
                <button
                  className="gw-delete"
                  onClick={() => {
                    const remaining = config.routes.filter(
                      (r) => r.id !== selected,
                    );
                    setConfig({ ...config, routes: remaining });
                    setSelected(remaining[0]?.id);
                    setNotice("Unsaved changes");
                  }}
                >
                  Remove route
                </button>
              </div>
            </>
          ) : (
            <div className="gw-route-empty">
              <h3>Create your first route</h3>
              <p>Add a path and backend to start configuring this Gateway.</p>
            </div>
          )}
        </section>
      </div>
      <div
        className={`gw-config-feedback${error ? " has-error" : ""}`}
        role="status"
      >
        {error ||
          notice ||
          "Configuration is stored on this device when you save."}
      </div>
      <details className="gw-config-help">
        <summary>How routing works</summary>
        <p>
          Routes match complete path segments; the longest prefix wins. Use View
          requests to inspect traffic in Network. Backend failures appear in
          Logs under Gateway errors. Saving keeps your setup; restart a running
          Gateway to apply edits.
        </p>
        <p>
          Flow animation shows direction, not live request activity. The
          listener uses HTTP on this machine; HTTPS backends are supported.
          WebSocket is not supported yet.
        </p>
      </details>
    </div>
  );
}

type Profile = { id: string; port: number };
function GatewayWorkspace() {
  const [profiles, setProfiles] = useState<Profile[]>(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("edith.gateways.v1") || "null",
      );
      if (
        Array.isArray(saved) &&
        saved.length > 0 &&
        saved.length <= 8 &&
        new Set(saved.map((p) => p.id)).size === saved.length &&
        saved.every(
          (p) =>
            typeof p.id === "string" &&
            /^[a-zA-Z0-9-]{1,64}$/.test(p.id) &&
            Number.isInteger(p.port) &&
            p.port >= 1024 &&
            p.port <= 65535,
        )
      )
        return saved;
    } catch {}
    return [{ id: "default", port: 8080 }];
  });
  const [active, setActive] = useState(profiles[0].id);
  const [diagrams, setDiagrams] = useState<
    Record<string, { nodes: DiagramNode[]; edges: DiagramEdge[] }>
  >({});
  const report = useCallback(
    (id: string, nodes: DiagramNode[], edges: DiagramEdge[]) =>
      setDiagrams((all) => ({ ...all, [id]: { nodes, edges } })),
    [],
  );
  const [positions, setPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [command, setCommand] = useState<{
    instance: string;
    node?: string;
    source?: string;
    target?: string;
    sequence: number;
  } | null>(null);
  let offset = 0;
  const combinedNodes: DiagramNode[] = [],
    combinedEdges: DiagramEdge[] = [];
  const owners = new Map<string, { instance: string; node: string }>();
  for (const profile of profiles) {
    const diagram = diagrams[profile.id];
    if (!diagram) continue;
    const ids = new Map(
      diagram.nodes.map((n) => [n.id, JSON.stringify([profile.id, n.id])]),
    );
    for (const n of diagram.nodes) {
      const id = ids.get(n.id)!;
      owners.set(id, { instance: profile.id, node: n.id });
      const position = positions[id] || { x: n.x, y: n.y + offset };
      combinedNodes.push({
        ...n,
        id,
        ...position,
        selected:
          profile.id === active && (n.kind === "listener" || n.selected),
        label: n.kind === "listener" ? n.label : n.label,
      });
    }
    combinedEdges.push(
      ...diagram.edges.map((e) => ({
        ...e,
        id: JSON.stringify([profile.id, e.id]),
        source: ids.get(e.source)!,
        target: ids.get(e.target)!,
      })),
    );
    offset +=
      Math.max(
        220,
        ...diagram.nodes.map((n) => n.y + (n.kind === "listener" ? 210 : 110)),
      ) + 70;
  }

  return (
    <>
      <section className="gw-instance-panel" aria-label="Gateway instances">
        <div className="gw-instance-heading">
          <div>
            <p>GATEWAY WORKSPACE</p>
            <h1>
              Your Gateways{" "}
              <span>
                {profiles.length}
                <small> / 8</small>
              </span>
            </h1>
            <span>
              Choose a Gateway to configure. All routes stay visible in the map.
            </span>
          </div>
          <button
            className="gw-instance-add"
            disabled={profiles.length >= 8}
            title={
              profiles.length >= 8
                ? "Maximum of 8 Gateways reached"
                : "Create another listener"
            }
            onClick={() => {
              const profile = {
                id: crypto.randomUUID(),
                port: (() => {
                  const used = new Set(
                    profiles.map((p) =>
                      Number(
                        diagrams[p.id]?.nodes
                          .find((n) => n.kind === "listener")
                          ?.label.split("\n")[1]
                          ?.split(":")
                          .pop() || p.port,
                      ),
                    ),
                  );
                  let port = 8080;
                  while (used.has(port)) port++;
                  return port;
                })(),
              };
              const next = [...profiles, profile];
              setProfiles(next);
              setActive(profile.id);
              try {
                localStorage.setItem("edith.gateways.v1", JSON.stringify(next));
              } catch {}
            }}
          >
            + Add Gateway
          </button>
        </div>
        <nav className="gw-instance-list" aria-label="Select Gateway">
          {profiles.map((p, i) => {
            const listener = diagrams[p.id]?.nodes.find(
              (n) => n.kind === "listener",
            );
            const state = listener?.statusTone || "stopped";
            const address =
              listener?.label.split("\n")[1] || `127.0.0.1:${p.port}`;
            const routeCount = diagrams[p.id]?.nodes.filter(
              (n) => n.kind === "route",
            ).length;
            return (
              <button
                type="button"
                key={p.id}
                className={`gw-instance-card${active === p.id ? " is-active" : ""}`}
                aria-pressed={active === p.id}
                onClick={() => setActive(p.id)}
              >
                <span className="gw-instance-card-top">
                  <strong>Gateway {i + 1}</strong>
                  <span className={`gw-instance-state is-${state}`}>
                    <i />
                    {state === "running"
                      ? "Running"
                      : state === "busy"
                        ? "Updating"
                        : state === "preview"
                          ? "Preview"
                          : listener?.status ===
                              "Development runtime unavailable"
                            ? "Unavailable"
                            : "Stopped"}
                  </span>
                </span>
                <code>{address}</code>
                <span className="gw-instance-card-bottom">
                  <span>
                    {routeCount ?? "—"} {routeCount === 1 ? "route" : "routes"}
                  </span>
                  <span>{active === p.id ? "Editing" : "Configure →"}</span>
                </span>
              </button>
            );
          })}
        </nav>
      </section>
      <div className="gw-shared-map">
        <div className="gw-shared-heading">
          <strong>All Gateways</strong>
          <span>
            {profiles.length} instances · Click a card to configure · Drag
            background to pan
          </span>
        </div>
        <div className="gw-canvas">
          <GatewayCanvas
            nodes={combinedNodes}
            edges={combinedEdges}
            onMove={(id, point) =>
              setPositions((all) => ({ ...all, [id]: point }))
            }
            onSelect={(id) => {
              const owner = owners.get(id);
              if (owner) {
                setActive(owner.instance);
                setCommand({ ...owner, sequence: Date.now() });
              }
            }}
            onConnect={(source, target) => {
              const a = owners.get(source),
                b = owners.get(target);
              if (a && b && a.instance === b.instance) {
                setActive(a.instance);
                setCommand({
                  instance: a.instance,
                  source: a.node,
                  target: b.node,
                  sequence: Date.now(),
                });
              }
            }}
          />
        </div>
      </div>
      {profiles.map((p) => (
        <div key={p.id} hidden={p.id !== active}>
          <Gateway
            instanceId={p.id}
            initialPort={p.port}
            onDiagram={report}
            command={command}
          />
        </div>
      ))}
    </>
  );
}
export function mountGateway(element: HTMLElement) {
  createRoot(element).render(<GatewayWorkspace />);
}
