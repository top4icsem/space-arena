# Lab 05 — Design note: latency, divergence, cheating, interpolation

## Delay and visible responsiveness

Server-only input waits for a server update; artificially injecting 100 ms nominal RTT exposes a clear lag. Client prediction integrates the SAME pure `shared/flight.js` immediately using the player's `seq`-tagged inputs, with no need to ask the server for permission to animate local movement. The server remains authoritative and sends a snapshot every 2 of its 30-Hz ticks.

## Reconciliation algorithm

For each snapshot, read the player's authoritative ship and `ack`. Remove locally buffered inputs with `seq <= ack`, reconstruct the newest predicted state by replaying higher sequences in order at `dt=1/30`, measure difference to previously drawn state, and ease the **visual** correction over ~100 ms. With high loss/jitter, lost inputs may not be simulated by the server; the next authoritative snapshot is the truth. The current demo caps prediction history at 120 inputs, limits transport queue growth and accepts that severe link conditions cause warps.

## Determinism and RNG

`shared/flight.js` is imported from the browser and server verbatim. It uses no wall-clock, engine, DOM, Node or random calls. `shared/prng.js` is seeded by Node when the room world is created; identical seeds and inputs produce matching world states in tests. If the client temporarily injects Math.random into its prediction, the server won't reproduce it: corrections increase. The UI toggle demonstrates this deliberate defect without shipping it in the canonical shared source.

## Cheats and limits

A malicious browser can invent a position if the server trusted coordinates. This server accepts only versioned input flags and a monotonic sequence, validates packet shapes, enforces input rate limits, and calculates its own hitboxes and score. A user can still automate or time their valid inputs; proper anti-cheat and lag-compensated hit validation are beyond the scope of Lab 05. Do not equate authority with complete game security.

## Interpolation target and cost

Remote ships and bullets use the historical target **120 ms** behind the last known server tick. The 15 Hz snapshot interval is ~66.7 ms, so 120 ms usually ensures two frames to interpolate between during moderate jitter. The cost is that another player's movement is rendered 120 ms behind the most recent simulated tick; client prediction is used only for the local ship. There is no remote extrapolation in this educational release.

## Transport comparison

The DataView protocol uses little-endian, an explicit version byte and angle `Int16`; JSON remains available via `?wire=json` for the A/B comparison. The reduction is a byte-count comparison, not evidence of network throughput improvement. On constrained links, smaller packets often help bandwidth and parsing costs, but compression and binary complexity introduce compatibility costs.

## Room persistence fix

Three seeded rooms (`orion`, `nebula`, `zenith`) carry `persistent: true`; leaving the last pilot retains the preset in `RoomManager.rooms`. Only user-created rooms trigger removal on the `empty` event. If you previously saw a single Zenith room after leaving other sectors, this fixes that specific source of disappearing rooms.
