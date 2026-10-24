import { isTauri } from "@tauri-apps/api/core";
export function isBundledDesktop() {
  return isTauri() && (location.protocol === "tauri:" || location.hostname === "tauri.localhost");
}
