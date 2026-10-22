import { useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { icon, type IconName } from "./icons";
import "./gateway-canvas.css";

export type DiagramNode = {
  id: string;
  x: number;
  y: number;
  label: string;
  kind: "listener" | "route" | "backend";
  selected?: boolean;
  status?: string;
  statusTone?: "running" | "stopped" | "busy" | "preview";
  actions?: {
    label: string;
    tone?: "start" | "stop" | "busy" | "preview";
    icon?: IconName;
    disabled?: boolean;
    pressed?: boolean;
    title?: string;
    run: () => void;
  }[];
};
export type DiagramEdge = {
  id: string;
  source: string;
  target: string;
  color: string;
  animated?: boolean;
};
type Point = { x: number; y: number };
type Gesture = {
  pointer: number;
  start: Point;
  origin: Point;
  node?: string;
  source?: string;
};
const width = 220,
  height = 90;
const nodeHeight = (node: DiagramNode) => (node.actions ? 190 : height);
function curve(a: Point, b: Point) {
  const bend = Math.max(70, Math.abs(b.x - a.x) / 2);
  return `M ${a.x} ${a.y} C ${a.x + bend} ${a.y}, ${b.x - bend} ${b.y}, ${b.x} ${b.y}`;
}
export function GatewayCanvas({
  nodes,
  edges,
  onMove,
  onSelect,
  onConnect,
}: {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  onMove: (id: string, point: Point) => void;
  onSelect: (id: string) => void;
  onConnect: (source: string, target: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [view, setView] = useState({ x: 15, y: 25, scale: 0.7 });
  const [wire, setWire] = useState<{ source: string; end: Point } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  function point(e: { clientX: number; clientY: number }): Point {
    const r = host.current!.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - view.x) / view.scale,
      y: (e.clientY - r.top - view.y) / view.scale,
    };
  }
  function zoom(factor: number) {
    const r = host.current!.getBoundingClientRect();
    setView((v) => {
      const scale = Math.max(0.25, Math.min(1.75, v.scale * factor));
      return {
        x: r.width / 2 - ((r.width / 2 - v.x) * scale) / v.scale,
        y: r.height / 2 - ((r.height / 2 - v.y) * scale) / v.scale,
        scale,
      };
    });
  }
  const currentNodes = useRef(nodes);
  currentNodes.current = nodes;
  const topology = nodes
    .map((n) => n.id)
    .sort()
    .join("|");
  function fit() {
    const r = host.current?.getBoundingClientRect();
    const all = currentNodes.current;
    if (!r || r.width <= 0 || r.height <= 0 || !all.length) return;
    const left = Math.min(...all.map((n) => n.x));
    const top = Math.min(...all.map((n) => n.y));
    const w = Math.max(...all.map((n) => n.x + width)) - left;
    const h = Math.max(...all.map((n) => n.y + nodeHeight(n))) - top;
    const scale = Math.min(
      1,
      Math.max(1, r.width - 64) / w,
      Math.max(1, r.height - 110) / h,
    );
    setView({
      x: (r.width - w * scale) / 2 - left * scale,
      y: 32 + (Math.max(1, r.height - 110) - h * scale) / 2 - top * scale,
      scale,
    });
  }
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    fit();
    const observer = new ResizeObserver(() => {
      if (!gesture.current) fit();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [topology]);
  function begin(e: PointerEvent, node?: DiagramNode, source?: string) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    host.current!.setPointerCapture(e.pointerId);
    gesture.current = {
      pointer: e.pointerId,
      start: { x: e.clientX, y: e.clientY },
      origin: node ? { x: node.x, y: node.y } : { x: view.x, y: view.y },
      node: node?.id,
      source,
    };
    if (source) {
      setWire({ source, end: point(e) });
      setPending(source);
    } else if (node) onSelect(node.id);
  }
  function end(e: PointerEvent, cancelled = false) {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    if (g.source && !cancelled) {
      const p = point(e);
      const target = nodes.find(
        (n) =>
          n.kind === "backend" &&
          Math.abs(p.x - n.x) < 25 &&
          Math.abs(p.y - n.y - height / 2) < 25,
      );
      if (target) {
        onConnect(g.source, target.id);
        setPending(null);
      }
    }
    gesture.current = null;
    setWire(null);
    if (host.current?.hasPointerCapture(e.pointerId))
      host.current.releasePointerCapture(e.pointerId);
  }
  const sourceNode = wire && nodes.find((n) => n.id === wire.source);
  return (
    <div
      ref={host}
      className="gw-diagram"
      tabIndex={0}
      role="region"
      aria-label="Gateway routing map. Drag background to pan. Use controls to zoom."
      onPointerDown={(e) => {
        if (
          e.target === e.currentTarget ||
          (e.target as Element).classList.contains("gw-world")
        )
          begin(e);
      }}
      onPointerMove={(e) => {
        const g = gesture.current;
        if (!g || g.pointer !== e.pointerId) return;
        if (g.source) setWire({ source: g.source, end: point(e) });
        else if (g.node)
          onMove(g.node, {
            x: g.origin.x + (e.clientX - g.start.x) / view.scale,
            y: g.origin.y + (e.clientY - g.start.y) / view.scale,
          });
        else
          setView((v) => ({
            ...v,
            x: g.origin.x + e.clientX - g.start.x,
            y: g.origin.y + e.clientY - g.start.y,
          }));
      }}
      onPointerUp={(e) => end(e)}
      onPointerCancel={(e) => end(e, true)}
      onLostPointerCapture={() => {
        gesture.current = null;
        setWire(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          gesture.current = null;
          setWire(null);
          setPending(null);
        }
      }}
    >
      <div
        className="gw-world"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
        }}
      >
        <svg className="gw-wires" aria-hidden="true">
          {edges.map((edge) => {
            const a = nodes.find((n) => n.id === edge.source),
              b = nodes.find((n) => n.id === edge.target);
            if (!a || !b) return null;
            const d = curve(
              { x: a.x + width, y: a.y + nodeHeight(a) / 2 },
              { x: b.x, y: b.y + nodeHeight(b) / 2 },
            );
            return (
              <g key={edge.id}>
                <path d={d} stroke={edge.color} />
                {edge.animated && (
                  <path
                    className="gw-flow-particles"
                    d={d}
                    stroke={edge.color}
                  />
                )}
              </g>
            );
          })}
          {sourceNode && wire && (
            <path
              className="gw-wire-preview"
              d={curve(
                { x: sourceNode.x + width, y: sourceNode.y + height / 2 },
                wire.end,
              )}
            />
          )}
        </svg>
        {nodes.map((n) => (
          <div
            key={n.id}
            className={`gw-card gw-card-${n.kind}${n.selected ? " gw-card-selected" : ""}`}
            style={{ left: n.x, top: n.y, height: nodeHeight(n) }}
          >
            {n.kind !== "listener" && (
              <button
                type="button"
                className="gw-port gw-port-in"
                aria-label={`Connect to ${n.label}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  if (pending && n.kind === "backend") {
                    onConnect(pending, n.id);
                    setPending(null);
                  }
                }}
              />
            )}
            <button
              type="button"
              className="gw-card-body"
              aria-label={`${n.label}. Arrow keys move this card.`}
              onPointerDown={(e) => begin(e, n)}
              onClick={() => onSelect(n.id)}
              onKeyDown={(e) => {
                const delta: Record<string, Point> = {
                  ArrowLeft: { x: -15, y: 0 },
                  ArrowRight: { x: 15, y: 0 },
                  ArrowUp: { x: 0, y: -15 },
                  ArrowDown: { x: 0, y: 15 },
                };
                if (delta[e.key]) {
                  e.preventDefault();
                  onMove(n.id, {
                    x: n.x + delta[e.key].x,
                    y: n.y + delta[e.key].y,
                  });
                }
              }}
            >
              <small>
                {n.kind === "listener" ? "ENTRY POINT" : n.kind.toUpperCase()}
              </small>
              <span>{n.label}</span>
            </button>
            {n.actions && (
              <div
                className="gw-node-runtime"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <span
                  className={`gw-node-status gw-node-status-${n.statusTone || "stopped"}`}
                  role="status"
                >
                  {n.status}
                </span>
                <div className="gw-node-actions">
                  {n.actions.map((action, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`gw-node-action-${action.tone || "preview"}`}
                      disabled={action.disabled}
                      aria-pressed={action.pressed}
                      title={action.title}
                      onClick={(e) => {
                        e.stopPropagation();
                        action.run();
                      }}
                    >
                      {action.icon && (
                        <span
                          className="gw-action-icon"
                          aria-hidden="true"
                          ref={(element) => {
                            if (element)
                              element.replaceChildren(icon(action.icon!));
                          }}
                        />
                      )}
                      <span>{action.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {n.kind === "route" && (
              <button
                type="button"
                className={`gw-port gw-port-out${pending === n.id ? " gw-port-pending" : ""}`}
                aria-label={`Connect ${n.label} to backend. Click then select backend input, or drag.`}
                onPointerDown={(e) => begin(e, undefined, n.id)}
                onClick={() => setPending(n.id)}
              />
            )}
          </div>
        ))}
      </div>
      <div
        className="gw-map-controls"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button aria-label="Zoom out" onClick={() => zoom(1 / 1.2)}>
          −
        </button>
        <output>{Math.round(view.scale * 100)}%</output>
        <button aria-label="Zoom in" onClick={() => zoom(1.2)}>
          +
        </button>
        <button onClick={fit}>Fit</button>
      </div>
      {pending && (
        <span className="gw-connect-hint" role="status">
          Select the matching backend input · Esc to cancel
        </span>
      )}
    </div>
  );
}
