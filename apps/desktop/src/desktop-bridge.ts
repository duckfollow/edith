import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { isBundledDesktop } from "./runtime-mode";
type RuntimeInfo = { port: number; mode: "local" | "team"; setupToken: string | null };
type Reply = { status: number; headers: Record<string, string>; body: number[] };
let info: RuntimeInfo | null = null;
let installed = false;
export function desktopServiceOrigin() { return info ? `http://127.0.0.1:${info.port}` : location.origin; }
export function desktopSetupToken() { return info?.setupToken || ""; }
export function installDesktopRuntimeBridge() {
  if (installed || !isBundledDesktop()) return;
  installed = true;
  void listen<string>("edith-runtime-error", event => {
    window.dispatchEvent(new CustomEvent("edith-runtime-notice", { detail: event.payload }));
  }).catch(() => {});
  const original = window.fetch.bind(window);
  const ready = invoke<RuntimeInfo>("desktop_runtime_info").then(value => { info = value; return value; });
  // Attach a rejection handler immediately; each request still receives the error.
  void ready.catch(() => {});
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith("/__edith_")) return original(input, init);
    const signal = init?.signal;
    if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
    const sourceHeaders = new Headers(init?.headers);
    const headers: Record<string, string> = {};
    for (const key of ["content-type", "x-edith-token"]) { const value = sourceHeaders.get(key); if (value) headers[key] = value; }
    let abort: (() => void) | undefined;
    const request = (async () => {
      await ready;
      if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
      if (init?.body != null && typeof init.body !== "string") throw Error("Desktop service accepts text request bodies only");
      const reply = await invoke<Reply>("desktop_runtime_request", { request: { path: url, method: init?.method || "GET", headers, body: init?.body ?? null } });
      return new Response([204, 205, 304].includes(reply.status) ? null : new Uint8Array(reply.body), { status: reply.status, headers: reply.headers });
    })();
    if (!signal) return request;
    try {
      return await Promise.race([request, new Promise<Response>((_, reject) => {
        abort = () => reject(new DOMException("Request aborted", "AbortError"));
        signal.addEventListener("abort", abort, { once: true });
      })]);
    } finally { if (abort) signal.removeEventListener("abort", abort); }
  };
  document.addEventListener("click", event => {
    const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href="/__edith_proxy/ca"]');
    if (!anchor) return;
    event.preventDefault();
    void invoke<string>("desktop_save_public_ca").then(path => {
      window.dispatchEvent(new CustomEvent("edith-runtime-notice", { detail: `Certificate saved to ${path}` }));
    }).catch(error => window.dispatchEvent(new CustomEvent("edith-runtime-notice", { detail: String(error) })));
  });
}

export async function switchDesktopWorkspace(mode: "local" | "team") {
  info = await invoke<RuntimeInfo>("desktop_set_workspace_mode", { mode });
}
