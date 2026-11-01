import { icon, type IconName } from "./icons";
function updateIcon(name: IconName) {
  return function UpdateIcon({
    size = 16,
    className = "",
  }: {
    size?: number;
    className?: string;
  }) {
    return (
      <span
        aria-hidden="true"
        className={`update-icon ${className}`}
        data-size={size}
        dangerouslySetInnerHTML={{ __html: icon(name).outerHTML }}
      />
    );
  };
}
export const CheckCircle2 = updateIcon("shield");
export const Download = updateIcon("download");
export const ExternalLink = updateIcon("external");
export const GitBranch = updateIcon("arrows");
export const Info = updateIcon("info");
export const RefreshCw = updateIcon("refresh");
export const X = updateIcon("close");
