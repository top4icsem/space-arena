# SPACE ARENA — Lab 08: Ship It 🚀

**Final milestone (8/8).** Real-time 2D multiplayer arena, server-authoritative physics, Docker image, production observability, WebSocket Origin controls, graceful shutdown, PWA and versioned release pipeline.

[![CI](https://github.com/top4icsem/space-arena/actions/workflows/ci.yml/badge.svg)](https://github.com/top4icsem/space-arena/actions/workflows/ci.yml) · [GitHub repository](https://github.com/top4icsem/space-arena) · [Lab 08 requirements](https://github.com/rmalkevy/Programming-Practice-Projects/blob/main/courses/javascript/lab-08-ship-it.md)

![Two-client gameplay from Lab 05](docs/two-clients-lab-05.gif)

## Play online

**Public HTTPS URL:** _Add after first successful deployment._

**WS:** automatic `wss://<your-host>/ws` on HTTPS. Both players must join the **same** room: Orion Belt, Nebula Run or Zenith Drift. Controls: **WASD / arrows** move, **Space** shoot, **P** pause, **R** reset. For eight bots use `?bots=8`.

**Install as PWA:** on Android Chrome open HTTPS URL → Install; on iPhone Safari → Share → Add to Home Screen. Playing still requires a live connection to the Node server.

## Architecture

```text
Player A (Wi-Fi) ─┐
                  ├─ HTTPS/WSS ─ Reverse proxy/TLS ─ Node 22 container (one instance)
Player B (4G) ────┘                                      │
                                     /ws → RoomManager → SharedWorld (30 Hz)
                                     /api/rooms, /health, /ready, /metrics
                                     pino JSON logs + NDJSON match records
                                     Vite-built static client + PWA assets
```

**Room affinity:** One instance only. All pilots in the same room must connect to the same process because the authoritative `SharedWorld` lives in memory; we do not claim horizontal scaling or shared state across replicas.

## Release / verification

```bash
npm install --include=optional
npm run check
CI=true npm run test:e2e
npm run test:docker  # needs Docker Desktop
# Local production container
docker compose up -d --build
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/ready
curl http://127.0.0.1:3000/metrics
docker compose down
```

Read **[deploy instructions](docs/lab08-deploy.md)**, **[defense](docs/defense-lab-08.md)** and **[reflection](docs/reflection-lab-08.md)**.

## Evidence needed before final submission

| Evidence                                        | Result / link                               |
| ----------------------------------------------- | ------------------------------------------- |
| GitHub Actions on tag `v1.0.0`                  | _Verify after push_                         |
| GHCR `ghcr.io/top4icsem/space-arena:v1.0.0`     | _Publish after CI_                          |
| Docker final image size (<200 MB)               | _Run `npm run test:docker`_                 |
| Docker SIGTERM shutdown (<10 s, exit 0)         | _Run `npm run test:docker` and save output_ |
| Public HTTPS page + `wss://`                    | _Add real deployed URL_                     |
| Player A outside network: RTT (ms)              | _Measure; do not estimate_                  |
| Player B outside network: RTT (ms)              | _Measure; do not estimate_                  |
| Other-room p99 before/after invalid input flood | _Measure and attach result_                 |
| Screen recording, 3–5 minutes                   | _Add video link_                            |

**Capacity:** configuration allows up to 24 rooms × 8 players = **192 configured player slots**, not a measured throughput guarantee. Use the Lab 07 headless 8/32/64/128-client load test and a real hosted run to record stable capacity.

## Prior lab measurements (for comparison)

| Metric                              | Lab 07 baseline | Lab 07 optimised |
| ----------------------------------- | --------------: | ---------------: |
| Server world step p50               |       0.0289 ms |        0.0269 ms |
| Server world step p95               |       0.1679 ms |        0.0919 ms |
| Server world step p99               |       0.2999 ms |        0.2630 ms |
| GC events (isolated Node benchmark) |              35 |               21 |

**Lab 05 wire / responsiveness comparison** (documented protocol properties, not fabricated throughput measurements):

| Lab 05 measure             | Binary input                                   | JSON alternative                               |
| -------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| Client input frame         | **7 bytes** (version, seq, mask)               | Variable length (human-readable fields)        |
| Authoritative server tick  | 30 Hz                                          | 30 Hz                                          |
| Remote snapshot cadence    | 15 Hz                                          | 15 Hz                                          |
| Remote interpolation delay | 120 ms                                         | 120 ms                                         |
| Trust model                | Input flags only; coordinates computed on Node | Input flags only; coordinates computed on Node |

These were measured on **Node 22.16.0 / Linux x64** in the earlier _isolated Node world_ benchmark (see `docs/performance-lab-07.md`). They are **not** public-host latency measurements, browser frame p99 or production capacity. Lab 05's binary wire, reconciliation and interpolation comparison is documented in [`docs/network-design-lab-05.md`](docs/network-design-lab-05.md).

---

## Earlier milestones and Lab 07 technical report
