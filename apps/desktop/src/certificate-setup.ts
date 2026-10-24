import { invoke, isTauri } from "@tauri-apps/api/core";
import { workspacePolicy } from "./access-policy";
type CA = { ready: boolean; fingerprint256?: string };
export function mountCertificateSetup(root: HTMLElement) {
  const get = <T extends HTMLElement>(name: string) => root.querySelector<T>(`[data-proxy="${name}"]`)!;
  const open = get<HTMLButtonElement>("ca-open");
  const verify = get<HTMLButtonElement>("ca-verify");
  const copy = get<HTMLButtonElement>("ca-copy");
  const feedback = get<HTMLElement>("ca-feedback");
  const trust = get<HTMLElement>("ca-trust-state");
  const native = isTauri();
  let ca: CA | undefined;
  let busy = false;
  function draw() {
    const available = ca?.ready && workspacePolicy.role === "admin";
    open.disabled = !native || !available || busy;
    verify.disabled = !native || !available || busy;
    copy.disabled = !ca?.fingerprint256 || busy;
    open.textContent = busy ? "Please wait…" : "Open in Keychain Access";
    get<HTMLElement>("ca-native-hint").hidden = native;
  }
  async function action(name: "open" | "verify") {
    if (busy || !ca?.ready || workspacePolicy.role !== "admin") return;
    busy = true; draw();
    const fingerprint = ca.fingerprint256;
    feedback.textContent = name === "open" ? "Opening your public certificate…" : "Checking macOS certificate trust…";
    try {
      const response = await fetch("/__edith_proxy/ca", { cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw Error("Unable to download the public certificate. Refresh and try again.");
      const pem = await response.text();
      if (pem.length > 32768 || !pem.trim().startsWith("-----BEGIN CERTIFICATE-----")) throw Error("Invalid public certificate response.");
      const result = await invoke<{ trusted: boolean | null }>("local_certificate_action", { pem, action: name });
      if (fingerprint !== ca?.fingerprint256) throw Error("Certificate changed. Check the current fingerprint and retry.");
      if (name === "open") {
        feedback.textContent = "In Keychain Access, choose the login keychain to add the certificate. Then follow step 2 below.";
      } else {
        trust.textContent = result.trusted ? "Trusted by macOS" : "Not trusted yet";
        trust.dataset.trusted = String(!!result.trusted);
        feedback.textContent = result.trusted
          ? "macOS accepts this CA for SSL. Enable HTTPS inspection and Start proxy next. Apps with their own trust stores or certificate pinning may still reject it."
          : "Complete the Trust steps in Keychain Access, then check again. This check does not change trust.";
      }
    } catch (e) { feedback.textContent = e instanceof Error ? e.message : String(e); }
    finally { busy = false; draw(); }
  }
  open.onclick = () => void action("open");
  verify.onclick = () => void action("verify");
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(ca?.fingerprint256 || ""); feedback.textContent = "SHA-256 fingerprint copied. Compare it with the certificate in Keychain Access."; }
    catch { feedback.textContent = "Open Certificate details below to select and copy the fingerprint."; }
  };
  draw();
  return {
    update(next: CA | undefined) {
      if (ca?.fingerprint256 !== next?.fingerprint256 || ca?.ready !== next?.ready) {
        trust.textContent = "Not checked";
        delete trust.dataset.trusted;
        feedback.textContent = "";
      }
      ca = next; draw();
    },
  };
}
