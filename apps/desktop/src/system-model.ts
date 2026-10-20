import type { Bucket } from "./overview-model";
export interface SystemSample {
  timestamp: number;
  cpuPercent: number | null;
  cores: Array<number | null>;
  memoryTotalBytes: number;
  memoryFreeBytes: number;
  memoryUsedBytes: number;
  memoryPercent: number;
  cpuModel: string;
  logicalCores: number;
  platform: string;
  arch: string;
  source: string;
}
export const SYSTEM_HISTORY_LIMIT = 300;
export function validSystemSample(value: unknown): value is SystemSample {
  if (!value || typeof value !== "object") return false;
  const v = value as SystemSample;
  const percent = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100;
  return (
    Number.isFinite(v.timestamp) &&
    v.timestamp > 0 &&
    (v.cpuPercent === null || percent(v.cpuPercent)) &&
    percent(v.memoryPercent) &&
    Array.isArray(v.cores) &&
    v.cores.every((c) => c === null || percent(c)) &&
    [v.memoryTotalBytes, v.memoryFreeBytes, v.memoryUsedBytes].every(
      (n) => Number.isFinite(n) && n >= 0,
    ) &&
    v.memoryTotalBytes > 0 &&
    v.cores.length === v.logicalCores &&
    v.memoryFreeBytes <= v.memoryTotalBytes &&
    v.memoryUsedBytes <= v.memoryTotalBytes &&
    typeof v.cpuModel === "string" &&
    Number.isInteger(v.logicalCores) &&
    v.logicalCores > 0 &&
    typeof v.platform === "string" &&
    typeof v.arch === "string" &&
    ["node-os", "rust-sysinfo"].includes(v.source)
  );
}
export function retainSamples(previous: SystemSample[], next: SystemSample) {
  if (
    previous.length &&
    next.timestamp <= previous[previous.length - 1].timestamp
  )
    return previous;
  return [...previous, next].slice(-SYSTEM_HISTORY_LIMIT);
}
export function systemSeries(
  samples: SystemSample[],
  seconds: number,
  metric: "cpuPercent" | "memoryPercent",
): Bucket[] {
  if (!samples.length) return [];
  const end = Math.floor(samples[samples.length - 1].timestamp / 1000) * 1000;
  const start = end - (seconds - 1) * 1000;
  const buckets: Bucket[] = Array.from({ length: seconds }, (_, i) => ({
    start: start + i * 1000,
    end: start + (i + 1) * 1000,
    count: 0,
    average: null,
  }));
  for (const sample of samples) {
    const index = Math.floor((sample.timestamp - start) / 1000);
    if (index < 0 || index >= seconds) continue;
    const value = sample[metric];
    buckets[index].count = value === null ? 0 : 1;
    buckets[index].average = value;
  }
  return buckets;
}
export function memoryBytes(value: number) {
  const gib = value / 1024 ** 3;
  return `${gib.toFixed(gib >= 10 ? 1 : 2)} GiB`;
}
