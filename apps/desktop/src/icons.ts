import {
  Activity,
  LayoutDashboard,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileUp,
  FlaskConical,
  Info,
  List,
  Monitor,
  Network,
  Pause,
  Play,
  Plug,
  RefreshCw,
  Search,
  ShieldCheck,
  Square,
  Trash2,
  Unplug,
  X,
  createElement,
} from "lucide";
const icons = {
  overview: LayoutDashboard,
  activity: Activity,
  arrowDown: ArrowDown,
  arrowUp: ArrowUp,
  arrows: ArrowLeftRight,
  database: Database,
  download: Download,
  external: ExternalLink,
  eye: Eye,
  eyeOff: EyeOff,
  upload: FileUp,
  demo: FlaskConical,
  info: Info,
  logs: List,
  monitor: Monitor,
  network: Network,
  pause: Pause,
  play: Play,
  plug: Plug,
  refresh: RefreshCw,
  search: Search,
  shield: ShieldCheck,
  stop: Square,
  clear: Trash2,
  unplug: Unplug,
  close: X,
};
export type IconName = keyof typeof icons;
export function icon(name: IconName): SVGElement {
  return createElement(icons[name], {
    class: "edith-icon",
    width: 16,
    height: 16,
    "stroke-width": 1.75,
    "aria-hidden": "true",
    focusable: "false",
  });
}
export function iconMarkup(name: IconName): string {
  return `<i data-edith-icon="${name}" aria-hidden="true"></i>`;
}
export function prependIcon(element: HTMLElement, name: IconName) {
  element.prepend(icon(name));
  element.classList.add("icon-button");
}
export function setIconLabel(
  element: HTMLElement,
  name: IconName,
  label: string,
) {
  element.replaceChildren(icon(name));
  if (label) {
    const text = document.createElement("span");
    text.textContent = label;
    element.append(text);
  }
  element.classList.add("icon-button");
}
export function mountIcons(root: HTMLElement) {
  root
    .querySelectorAll<HTMLElement>("i[data-edith-icon]")
    .forEach((placeholder) => {
      const name = placeholder.dataset.edithIcon as IconName;
      if (!Object.prototype.hasOwnProperty.call(icons, name)) return;
      const svg = icon(name);
      const parent = placeholder.parentElement;
      placeholder.replaceWith(svg);
      if (parent?.tagName === "BUTTON") parent.classList.add("icon-button");
    });
}
