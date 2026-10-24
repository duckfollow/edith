import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { icon } from "./icons";
type Appearance = "system" | "dark" | "light";
export function mountAppearance(root: HTMLElement) {
  const key = "edith-appearance";
  const media = matchMedia("(prefers-color-scheme: dark)");
  const valid = (value: string | null): Appearance => value === "dark" || value === "light" ? value : "system";
  let preference: Appearance = "system";
  try { preference = valid(localStorage.getItem(key)); } catch { /* Use system default. */ }
  const label = document.createElement("label");
  label.className = "wb-appearance";
  const caption = document.createElement("span");
  caption.className = "wb-appearance-icon";
  caption.setAttribute("aria-hidden", "true");
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Appearance");
  for (const [value, text] of [["system", "System"], ["light", "Light"], ["dark", "Dark"]]) select.add(new Option(text, value));
  label.append(caption, select);
  root.prepend(label);
  const nativeWindow = isTauri() ? getCurrentWindow() : null;
  let generation = 0;
  let nativeUpdate = Promise.resolve();
  function render(resolved = preference === "system" ? media.matches ? "dark" : "light" : preference) {
    document.documentElement.dataset.theme = resolved;
    select.value = preference;
    caption.replaceChildren(icon(preference === "system" ? "monitor" : preference === "light" ? "sun" : "moon"));
    label.title = `Appearance: ${preference === "system" ? "System" : preference === "light" ? "Light" : "Dark"}`;
  }
  function apply() {
    render();
    const current = ++generation;
    if (!nativeWindow) return;
    // Serialize updates so a slower previous selection cannot win the race.
    nativeUpdate = nativeUpdate.catch(() => {}).then(async () => {
      if (current !== generation) return;
      // null releases the native appearance override. Resolving System to a
      // concrete theme here would feed the override back into matchMedia.
      await nativeWindow.setTheme(preference === "system" ? null : preference);
      if (current !== generation || preference !== "system") return;
      const actual = await nativeWindow.theme();
      if (current === generation && preference === "system") {
        render(actual === "dark" || actual === "light" ? actual : media.matches ? "dark" : "light");
      }
    }).catch(() => {
      if (current === generation) render();
    });
  }
  select.onchange = () => {
    preference = valid(select.value);
    try { localStorage.setItem(key, preference); } catch { /* Retain session preference. */ }
    apply();
  };
  media.addEventListener("change", () => { if (preference === "system") render(); });
  window.addEventListener("storage", event => {
    if (event.key === key || event.key === null) { preference = valid(event.newValue); apply(); }
  });
  apply();
}
