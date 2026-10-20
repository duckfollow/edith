# Example API

From the repository root, run:

```sh
npm run demo:api
```

Uses Node.js only, listens on `127.0.0.1:3000`, and prints JSONL request logs to the terminal. Users live in memory and reset on restart. Stop with Ctrl+C. To change the port, set `PORT` (Bash/Zsh: `PORT=4000 npm run demo:api`; PowerShell: `$env:PORT='4000'; npm run demo:api`).

| Endpoint            | Response                                          |
| ------------------- | ------------------------------------------------- |
| GET `/`             | Endpoint list                                     |
| GET `/health`       | 200, health status                                |
| GET `/users`        | 200, user list                                    |
| POST `/users`       | 201, created user; JSON body `{"name":"Charlie"}` |
| GET `/slow?ms=1000` | Delayed response, 0–5000 ms                       |
| GET `/error`        | Intentional 503                                   |
| Unknown path        | 404                                               |

## Direct requests

```sh
curl http://127.0.0.1:3000/users
curl -X POST http://127.0.0.1:3000/users -H 'Content-Type: application/json' -d '{"name":"Charlie"}'
curl 'http://127.0.0.1:3000/slow?ms=1500'
curl http://127.0.0.1:3000/error
```

On Windows use `curl.exe` when PowerShell aliases `curl` to another command.

## Inspect through EDITH

Start EDITH with `npm run dev:web --workspace appsdesktop`, open Network and click **Start proxy** (default port 8899). In another terminal:

```sh
curl --noproxy '' -x http://127.0.0.1:8899 http://127.0.0.1:3000/users
curl --noproxy '' -x http://127.0.0.1:8899 -X POST http://127.0.0.1:3000/users -H 'Content-Type: application/json' -d '{"name":"Charlie"}'
curl --noproxy '' -x http://127.0.0.1:8899 'http://127.0.0.1:3000/slow?ms=1500'
curl --noproxy '' -x http://127.0.0.1:8899 http://127.0.0.1:3000/error
```

## Inspect through Gateway

In EDITH, open **Gateway** and configure port `8080`, path `/api`, backend `http://127.0.0.1:3000`, and **Strip path prefix** enabled. Click **Start Gateway** and open:

```sh
curl http://127.0.0.1:8080/api/users
```

Stop Gateway before changing ports or applying edited routes. Click **View requests** on the route, or choose **Gateway** as the traffic source in Network Inspector. In Logs choose **Gateway errors** to inspect `/api/error` failures.
