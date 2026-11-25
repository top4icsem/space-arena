# Lab 06 — 5-minute defense plan

**0:00–1:00** Open the actual game in two Chrome tabs. Name players Alice/Bob, join **Orion Belt**, fly, fire, show that both ships appear and chat still works. Remind the teacher that server owns the world; browser sends only input.

**1:00–2:00** Show `shared/flight.ts`, `shared/world.ts`, `shared/codec.ts`. Explain: `strict`, deterministic fixed-step simulation, same equations on both platforms, no ambient random or wall time in sim.

**2:00–3:00** Show `shared/types.ts`. `EntityId` is not interchangeable with `InputSeq`; `Vector2.x` is readonly. Demonstrate the actual migration errors in README: TS2540 readonly angle and TS2532 possibly missing pending[0].

**3:00–4:00** Show `server/src/protocol.ts`: `ClientMessageSchema` Zod safeParse, `unknown`, no raw manual type chains. In `server/src/ws.ts`, show exhaustive `switch` and `default: never`. Show `server/src/config.ts` env Zod.

**4:00–5:00** Run `npm run typecheck`, then answer 2–3 questions on runtime validation, branding and why not React. If time, show the existing binary decoder still uses little endian and validates packet size/version.

If an error occurs during defense, open `http://localhost:3000/health` to distinguish server startup from Vite/browser errors. The _actual WebSocket session_ must be checked on your machine before submission.
