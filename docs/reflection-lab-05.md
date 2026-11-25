# Lab 05 — Reflection: short oral answers

**Why not send x/y from the client?** The client is untrusted and could teleport, fire across the map or lie about hits. We send control flags only; the server integrates positions, projectiles and collisions.

**What is `seq`?** A strictly increasing number for each input. The server acknowledges the latest processed sequence in a per-client snapshot; the browser discards older pending inputs and replays only the unacknowledged ones.

**Why do we predict?** Waiting for a network round trip makes keyboard control feel sluggish. Local prediction gives instant visual feedback; server correction repairs divergence.

**Why smoothing?** A hard snap to authoritative state looks like jitter. We replay into the correct predicted state immediately but animate only the visual offset toward zero over ~100 ms.

**How do other players move smoothly?** They are rendered from two known snapshots about 120 ms behind the current server tick, interpolating across coordinates/angles and wrap boundaries. There is no prediction for other players.

**Why 30 Hz and no `setInterval`?** Server integrates fixed `dt` for stable physics and schedules each tick against an absolute target time using `performance.now()` and `setTimeout`. Fixed-target scheduling avoids accumulating callback drift; a capped catch-up prevents a spiral of death.

**Why seeded PRNG?** `Math.random()` changes world results across runs. A seeded generator makes random asteroid spawns repeatable and testable with the same seed and inputs.

**What is `ArrayBuffer` vs `DataView`?** ArrayBuffer stores raw bytes. DataView reads and writes typed values at exact offsets, with an explicit little-endian flag and fields such as `Int16` for angles. Both peers must agree on version/size/layout.

**Why binary instead of JSON?** It avoids repeated field names and large decimal strings. Measured average snapshot: 1,350 JSON bytes vs 284 binary bytes in the reproducible fixture. JSON stays available for debugging.

**What if packets are lost?** WebSocket itself is reliable and ordered; our application-level simulator deliberately omits some input/snapshot messages. The server keeps authority, and later snapshots reconcile the local estimate. At serious loss, visible correction increases.

**Does Lab 05 still have chat?** Yes. Text chat/roster remain JSON WebSocket events, while frequent game input/snapshots use binary by default. There is one shared real server world per room.
