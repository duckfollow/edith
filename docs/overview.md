# Overview and graphs

Overview is the default tool in the sidebar. It summarizes the currently retained Network and Logs records for the selected SDK app or the file/proxy workspace. Packet samples are independent and do not feed these HTTP charts.

## Metrics

- HTTP request count; CONNECT tunnels shown separately and excluded from HTTP aggregates.
- Failure rate: status 0, 4xx, and 5xx divided by retained HTTP requests.
- P95 duration using nearest rank, with mean duration shown underneath.
- ERROR/FATAL log count, with the total retained log count.

Timing semantics differ by source: SDK durations end when fetch response headers arrive; proxy and HAR durations can include the response transfer. This is displayed in the UI. The summary is not a cumulative session counter and can change when records are cleared or evicted.

## Graphs and interaction

- Request count over 24 equal time buckets.
- Mean response duration per bucket. Empty latency buckets are gaps, not zero-duration measurements.
- Status and method distributions. Click a bar to open matching retained records in Network. This sets status/method filters and clears the text search; the Overview time window is not applied to Network.
- All retained / Latest 60 seconds / Latest 5 minutes. Windows end at the latest recorded timestamp, including logs, so historical HARs remain inspectable. These are event-relative windows, not rolling wall-clock rate measurements.
- Invalid or missing timestamps are included in All retained totals, excluded from time graphs, and called out. Time-window filters exclude undated records.
- Network and Logs sources are named separately; importing unrelated files does not imply that their events belong to the same session.
- **Load overview demo** loads the explicit HAR/log fixtures. It refuses to replace a selected SDK app or active proxy view.

Graphs update with imported files, SDK events, and proxied HTTP records. Clearing or changing the selected app updates the summary. No synthetic traffic is loaded automatically, and an empty workspace shows empty graphs rather than fabricated values. Times use the viewing machine's locale, with the latest full timestamp listed beneath the graphs. Axes, SVG labels, and native point tooltips support inspection without a chart-library dependency.

Aggregation tests cover CONNECT exclusion, P95, failure rates, log levels, historical time windows, invalid timestamps, and endpoint buckets. Frontend build and TypeScript checks verify integration; browser visual verification remains pending.
