# System Monitor

System Monitor reads **whole-machine CPU and RAM** from the machine running EDITH. It is independent of the selected SDK application and does not measure a connected app's process. No disk, GPU, temperature, process list, or remote host monitoring is included in this phase.

## Use

Select **System Monitor** in the sidebar. Collection begins when the tool is visible, with one request approximately every second. The first CPU sample primes the counters and is shown as unknown, not as a fabricated 0%. A second sample produces an interval measurement. Pause stops collection; Resume starts a fresh CPU baseline. Leaving the tool stops collection as well. Returning retains the previous chart history but starts a new baseline.

- CPU usage is normalized across logical cores to a whole-machine 0–100% value, with a separate per-core view.
- RAM non-free = physical total RAM minus OS-reported free RAM. It may include caches and is **not memory pressure** or an application's resident memory. Native and development OS providers can account for free/cached memory differently.
- GiB values use binary units (1 GiB = 1024³ bytes).
- Current RAM values, CPU model, core count, platform, and architecture come from the host provider. No hostnames or process identities are requested.

## Graphs and retention

The CPU and RAM graphs use a fixed 0–100% scale, precise sample inspection, and 60-second or 5-minute windows ending at the latest sample. At most 300 snapshots are retained in memory. Missing intervals, errors, paused time, and unknown CPU baselines remain gaps; the graphs do not forward-fill them with old values. The displayed history is not a permanent recording and disappears on reload. Clear history clears the local buffer without disabling collection.

## Providers

- **Tauri desktop:** the `sample_system_metrics` command uses Rust `sysinfo`, managed sampler state, CPU refresh deltas, and memory reads. It does not scan processes or require elevated permissions. Rebuild/restart the desktop app after adding this command.
- **Development web preview:** a protected same-origin `/__edith_system/snapshot` route reads Node's `os.cpus()`, `totalmem()`, and `freemem()` on the machine running the development server. It measures that machine, not the browser process.
- **Standalone static build:** without a native command or development backend the tool displays an unavailable error instead of sample/fake telemetry.

Both providers cache reads within roughly 900 ms. The frontend serializes polling, ignores late results after pause/navigation, bounds history, and resets CPU measurement after collection is restarted. Providers have no sampling interval that continues after the UI stops requesting values. Graph redraws respond to their container width.

The development route accepts only local workspace Host/Origin combinations, rejects cross-site requests, exposes no permissive CORS, and sends `Cache-Control: no-store`. Data is not uploaded or persisted.

## Verification and platform scope

The desktop frontend TypeScript build passes. Node tests verify CPU deltas, normalization, warm-up/counter resets, caching, memory consistency, actual host reads, and endpoint isolation. Model tests verify bounded history, duplicate/out-of-order samples, validation, and missing-interval graphs. A Rust test reads actual macOS metrics, checks CPU warm-up and refresh after an interval, and verifies memory consistency and cached reads. The native code and command registration compile on this macOS machine.

The implementation uses cross-platform providers for macOS/Windows/Linux. Windows and Linux native builds and visual UI checks have not been verified in this environment.
