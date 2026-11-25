# Lab 06 — Reflection (sample defense questions)

**Why is TypeScript not a substitute for Zod?** Types disappear after compilation. A malicious client can send invalid JSON, out-of-range masks or an unexpected command. `unknown` plus Zod `safeParse` validates the _actual bytes at runtime_; the server logs the failure and disconnects the socket safely.

**Why use branded EntityId, InputSeq and StepId?** All three are numeric in JavaScript, so without brands it is easy to mix arguments accidentally. Nominal brands make such mistakes compile-time errors. A branded constructor validates the number once at the boundary.

**What is `never` used for?** It represents an impossible value in an exhaustive `switch`. With a discriminated union, all known `type` or `kind` branches are handled; adding a new variant makes the default branch fail `tsc` until it is implemented.

**What does `noUncheckedIndexedAccess` protect against?** A valid array type does not guarantee that element `array[0]` exists. Index access becomes `T | undefined`, requiring a guard or proven invariant. During migration it flagged `p.pending[0]`.

**What happened to deterministic simulation?** Equations, fixed `dt`, seed and order of updates are unchanged. TS brands and annotations disappear at runtime. The 300-step seeded determinism test compares the final snapshots for identical input streams.

**Why no framework for the HUD?** The task allows it but does not require it. Canvas rendering and native DOM lobby are already separated from network and simulation. Introducing a framework would distract from typing and create regression risk.
