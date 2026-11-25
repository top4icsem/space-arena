# 5-minute defense — Space Arena Lab 05

**00:00–00:40** — Open VS Code and run `npm run dev`. Show three rooms persist by refreshing `http://localhost:3000/api/rooms`. Explain Lab 04 fixed room deletion and that the same repository/previous tags remain.

**00:40–01:45** — Open game in two Chrome windows. Join Orion as Player1 and Player2, show 2 ships in BOTH windows, steer independently W/A/D, fire Space and see impacts/HP. Show chat still works. Note each player sends only input commands; Node owns positions.

**01:45–02:40** — Point at the netgraph: RTT, age, bytes/s, pending input queue and correction. In `?latency=100&jitter=25`, toggle Prediction ON vs Server only. Explain input seq → server ACK → replay → ~100 ms smoothing.

**02:40–03:35** — Toggle Divergence ON and OFF; explain why random client physics break correction. Talk about foreign-entity interpolation at 120 ms.

**03:35–04:25** — Show `shared/flight.js`, `shared/codec.js` and `server/src/network/ticker.js`. Explain shared pure physics, seeded RNG, little-endian DataView, angle as Int16, 30 Hz target-clock scheduler. Run `npm run bench:wire` to compare bytes.

**04:25–05:00** — Answer two or three Reflection questions. Show `npm run check` output and GitHub `lab-05` tag if the tutor asks.

**Before defense:** swap the illustrative GIF in README for a recording of your live Node.js server with both actual browser clients. Do NOT present the initial mock demo GIF as real server evidence.
