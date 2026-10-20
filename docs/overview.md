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

## GitHub-inspired activity calendar

Overview includes a contribution-style calendar with 53 Sunday-first week columns and a 365-day range ending at the latest retained dated HTTP request (today when there are no dated HTTP records). It uses local calendar dates, including DST-safe day iteration, rather than fixed 24-hour offsets. Month/weekday labels, a five-step green legend, daily tooltips, click selection, and arrow-key navigation are included. Narrow screens scroll the calendar horizontally to keep the cells legible.

This is an aggregate of retained records, not stored year-long history. Blank-colored days mean no retained requests for that day; traffic may have occurred before records were evicted or before EDITH was running. Counts exclude CONNECT and invalid timestamps. The calendar is independent of the shorter timeline time selector. Green intensity is relative to the busiest day within the displayed year; older retained events do not affect the scale.

The app shares a GitHub-inspired dark palette with neutral surfaces, thin borders, green actions and activity marks, and Lucide icons. No GitHub branding or GitHub account data is used. Calendar tests validate the 365-day window, week alignment, real-count aggregation, year bounds, and missing timestamps.

## Time-series presentation

Request activity uses a green curve and subtle gradient fill; Response time uses blue so the measures remain visually distinct. Each card shows its peak bucket value when idle and exact bucket values on pointer hover, touch pinning, or the keyboard-accessible range control. A dashed crosshair and bounded tooltip identify the time range and value. Escape dismisses keyboard inspection. Curves use bounded control points, preserve missing latency segments, and do not imply additional observed measurements between buckets. Data/size signatures avoid redrawing the same graph and preserve keyboard focus during refreshes.
