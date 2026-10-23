import "./loading.css";
/** CSS-only animation with an optional minimum display duration. */
export function createLoading({
  label = "Loading…",
  description = "",
  compact = false,
  minimumDurationMs = 0,
}: {
  label?: string;
  description?: string;
  compact?: boolean;
  minimumDurationMs?: number;
} = {}) {
  const startedAt = performance.now();
  const duration = Number.isFinite(minimumDurationMs)
    ? Math.max(0, minimumDurationMs)
    : 0;
  const element = document.createElement("div");
  element.className = `edith-loading${compact ? " is-compact" : ""}`;
  element.setAttribute("role", "status");
  element.setAttribute("aria-live", "polite");
  const graphic = document.createElement("span");
  graphic.className = "edith-loading-graphic";
  graphic.setAttribute("aria-hidden", "true");
  const mark = document.createElement("span");
  mark.className = "edith-loading-mark";
  for (const letter of "EDITH") {
    const character = document.createElement("span");
    character.className = "edith-loading-letter";
    character.textContent = letter;
    mark.append(character);
  }
  graphic.append(mark);
  const title = document.createElement("span");
  title.className = "edith-loading-label";
  const detail = document.createElement("span");
  detail.className = "edith-loading-description";
  function update(nextLabel: string, nextDescription = description) {
    element.setAttribute(
      "aria-label",
      nextDescription ? `${nextLabel}. ${nextDescription}` : nextLabel,
    );
    title.textContent = nextLabel;
    detail.textContent = nextDescription;
    detail.hidden = !nextDescription;
  }
  update(label);
  element.append(graphic, title, detail);
  async function waitForMinimum() {
    const remaining = duration - (performance.now() - startedAt);
    if (remaining > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, remaining));
    }
  }
  return { element, update, waitForMinimum, destroy: () => element.remove() };
}
