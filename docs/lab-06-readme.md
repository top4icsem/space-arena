# SPACE ARENA — Lab 06: TypeScript for Protocol and Simulation

> **Milestone 6 / 8.** The same multiplayer game from Labs 01–05, now with strictly checked shared simulation, branded IDs, typed WebSocket code, Zod input validation and a CI typecheck. No framework was added to the Canvas UI.

![Space Arena two clients](docs/two-clients-lab-05.gif)

**Assignment:** [Lab 06 — TypeScript](https://github.com/rmalkevy/Programming-Practice-Projects/blob/main/courses/javascript/lab-06-typescript.md) · [Notes](https://github.com/rmalkevy/Programming-Practice-Projects/blob/main/courses/javascript/lab-06-typescript.notes.md)

## 1. Run and verify

Install **Node.js 22.16+** and npm. Node 22 uses `--experimental-strip-types` in the server and test scripts; TypeScript is checked by `tsc` and stripped at runtime, without a production transpilation step on the server.

```bash
npm install
npm run format
npm run typecheck
npm run check
npm run dev
```

Open the Vite URL printed by the terminal (e.g. `http://localhost:5173`). Start two tabs, choose the same room (Orion Belt / Nebula Run / Zenith Drift), enter two different names, and press **Join Mission**. Both ships should move in the same authoritative game; WS chat, shooting and netgraph remain from Lab 05.

`npm run check` runs ESLint → Prettier → TypeScript `strict` typecheck → tests → Vite build. A deliberately invalid `broken.json` fixture from Lab 03 is ignored by Prettier. Generated `dist` folders are ignored as well.

## 2. TypeScript architecture

```text
space-arena/
├── client/
│   └── src/network/
│       ├── connection.ts   # typed browser WebSocket; parse untrusted messages
│       └── netcode.ts      # prediction, reconciliation, interpolation
├── server/
│   └── src/
│       ├── protocol.ts    # Zod discriminated union of client messages
│       ├── config.ts      # environment validation with Zod
│       ├── rooms.ts       # EventEmitter + typed RoomEvent
│       ├── ws.ts          # exhaustive switch, unknown catches, close codes
│       ├── http.ts        # HTTP API with Zod POST validation
│       ├── index.ts       # Node entry and shutdown
│       ├── log/           # typed streaming NDJSON writer and replay
│       └── network/       # typed server tick scheduler and world sessions
├── shared/
│   ├── types.ts           # EntityId, InputSeq, StepId, Vector2, kind union
│   ├── flight.ts          # pure fixed-dt movement
│   ├── prng.ts            # seeded RNG
│   ├── world.ts           # authoritative world
│   └── codec.ts           # DataView + byte order/size/range validation
├── tsconfig.json          # strict=true, noUncheckedIndexedAccess=true
├── .github/workflows/ci.yml
└── apply-lab06.mjs        # preserve existing repo/history
```

**Migration scope:** all server source and all `shared/` core files are TypeScript; the browser networking core is TypeScript. Existing Canvas renderer, DOM lobby, local sandbox and legacy experiment modules remain JavaScript, because the lab does not require a new UI framework. TypeScript's `strict` compiler checks all new `.ts` modules; those retained `.js` presentation modules are not falsely represented as typechecked (`checkJs: false`). A full conversion of legacy UI modules is a separate refactor.

No `any` is used in the TypeScript sources. There are three validated `as` casts, all for the branded numeric constructors in `shared/types.ts`, with short comments. Value types are inferred from Zod schemas in the server protocol. `catch` uses `unknown` and narrows via `instanceof Error`.

## 3. Three essential types, simply explained

1. **`readonly Vector2`** — an immutable coordinate contract. You cannot assign to `point.x`; the simulation creates new position values instead. This prevents an accidental mutation of a shared snapshot or input.
2. **Branded IDs** — `EntityId`, `StepId`, and `InputSeq` are all numbers at runtime, but _different_ TypeScript types. `moveShip(seq)` is rejected if the function expects an entity ID. Validated factory functions (`entityId`, `stepId`, `inputSeq`) create those values at trust boundaries.
3. **Discriminated union** — `SnapshotEntity` has `kind: 'ship' | 'bullet' | 'asteroid' | 'pickup'`. `entityLabel` switches on `kind`. The default case calls `assertNever`, so introducing a new kind without handling it causes a type error.

The protocol uses the same idea: `ClientMessageSchema` is a Zod discriminated union over `type`. Its output is `z.infer<typeof ClientMessageSchema>`, not a handwritten duplicate interface. Adding a new client command without a new case in `server/src/ws.ts` triggers the `never` exhaustiveness check.

## 4. Compile-time bugs discovered during migration

Two actual errors caught by `tsc` while converting the Lab 05 implementation:

- **Mutation of readonly state:** the Lab 05 `addPlayer` code set `state.angle = ...` immediately after calling `createShip`. When `createShip` began returning `FlightState` with readonly fields, TypeScript rejected that assignment (`TS2540`). Fixed by building a new object with `angle` during creation, not mutating the return value.
- **Unsafe array indexing:** `p.pending[0].seq` was accepted in ordinary JS, but `noUncheckedIndexedAccess` reported that element `0` could be `undefined` (`TS2532`). Fixed the loop to use an explicit presence condition; validated input sequences still replay the same way.

There is also a compile-time test in `shared/test/types-lab06.test.ts` using `@ts-expect-error` that demonstrates illegal mixing of branded IDs and mutation of `readonly` coordinates. Remove the directives to see the compiler reject those operations.

## 5. Runtime checks: why TypeScript alone is not enough

TypeScript disappears when JavaScript is executed. Network payloads, environment variables, HTTP bodies, and WebSocket frames are **untrusted runtime values**.

- `parseClientMessage(input: unknown)` decodes bytes, checks the byte cap and uses `ClientMessageSchema.safeParse`. Bad UTF-8/JSON, wrong `v`, unknown `type`, unsupported fields or invalid values become a `ProtocolError`. The WebSocket handler logs the reason and closes the client with a policy or size code instead of crashing Node.
- Server `readConfig` checks the environment through a Zod object and validated integer fields. An invalid port or rate limit rejects server startup.
- HTTP `POST /api/rooms` uses a strict Zod object; unknown keys and malformed room names return HTTP 400.
- The binary `DataView` decoder checks protocol version, message type, exact byte count, flags, coordinates and finite velocities. It uses little-endian reads and the same on-the-wire layout as Lab 05, so the authoritative 30 Hz simulation remains compatible.

The sim has no DOM, Node imports, wall clock or ambient `Math.random()`; seeded PRNG generates world events and identical input sequences produce identical snapshots. Browser prediction uses the same `shared/flight.ts` integration as Node.

## 6. Why no React/Svelte/Vue?

The Canvas scene, HUD, lobby DOM and fixed game loop already work without a framework. Migrating a framework would introduce additional dependencies and unrelated risk while this lab is specifically about network and simulation types. We keep native DOM + Canvas and type the critical transport and authoritative simulation first.

## 7. Tests and CI

```bash
npm run typecheck
npm test
npm run build
npm run check
```

`tsconfig.json` has `strict: true`, `noUncheckedIndexedAccess: true`, no emit and `.ts` import support. The GitHub Actions workflow in `.github/workflows/ci.yml` installs dependencies and explicitly runs `npm run typecheck` before `npm run check` on `main`, PRs and `lab-*` tags.

Coverage includes older Labs 01–05 tests (including determinism, wire codec and two real WS clients) and new Lab 06 tests (branded ID constructors, `kind` handling, Zod invalid JSON, invalid commands and environment config). The checked-in source does not claim that a browser's network latency is deterministic; network delay still changes how prediction and interpolation appear.

**Local development verification:** run `npm run check` after `npm install` on your Mac; this is necessary to check against the actual installed `zod`, `ws` and Vite. The archived update was additionally checked against local TypeScript typings and a temporary offline validation shim, not substituted for a successful real npm test run.

## 8. Submission and defense

After all checks and a two-tab playtest:

```bash
git add -A
git commit -m "Lab 06: strict TypeScript simulation and Zod protocol"
git tag lab-06
git push origin main
git push origin lab-06
```

Submit the **same public repository**: https://github.com/top4icsem/space-arena , ideally with a link to tag `lab-06`.

Five-minute defense: open two tabs and demonstrate two real players → show the `readonly` assignment error TypeScript caught → show Zod refusing malformed input / `npm run typecheck` → answer 2–3 questions. See [defense](docs/defense-lab-06.md) and [Reflection](docs/reflection-lab-06.md). Previous Lab 05 README is kept in `docs/lab-05-readme.md` by the upgrade script.
