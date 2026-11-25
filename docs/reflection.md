# Lab 01 — Reflection: short answers for a 5-minute defense

1. **Runtime diagram.** The JS call stack holds currently executing function frames; objects live on the heap. Browser Web APIs schedule future work. `setTimeout` queues a task, whereas `Promise.then` queues a microtask. The event loop runs JS to completion, drains microtasks at checkpoints, and the browser may then update rendering. `setTimeout(f, 0); Promise.resolve().then(g)` usually runs `g` before `f` because microtasks are drained before the next timer task.

2. **Why 100 ms freezes.** A synchronous loop occupies the single JavaScript thread continuously. Pending input callbacks, timers, promise reactions and rAF callbacks cannot run until the stack unwinds. Another callback on that thread cannot bypass it; the remedy is to divide work, do less work, or offload suitable work (e.g. Worker).

3. **Microtasks vs tasks.** Following a task/callback, the host runs queued microtasks until the microtask queue is empty; only then may it render or run another task. A microtask that keeps queuing itself can starve rendering. Timers schedule separate tasks, allowing rendering opportunities between tasks (subject to browser scheduling).

4. **Where rAF fits.** rAF callbacks run as part of the browser's rendering update, before a paint. They are not regular tasks or microtasks. rAF is preferable for animation because it aligns with display refresh, receives a high-resolution timestamp, and typically pauses/throttles when the document is not visible. A `setInterval(..., 16)` neither matches 16.667 ms at 60 Hz nor synchronizes to paint.

5. **Accumulator, clamp, alpha.** Add elapsed time to an accumulator; execute `while (accumulator >= fixedDt)` physics steps; subtract the fixed step each time. A clamp prevents a tab return or debugger pause from causing a gigantic backlog. `alpha = accumulator / fixedDt` tells the renderer how far between `previous` and `current` it should draw for smooth motion between physics updates. We also cap the number of steps per frame to avoid a spiral of death.

6. **Determinism and multiplayer.** Equal initial state + equal input sequence + equal timestep sequence should yield equal outputs. This supports client-side prediction and reapplying unacknowledged inputs after an authoritative snapshot in Lab 05. Wall-clock time or uncontrolled randomness inside physics breaks that property.

7. **Closures: values or variables?** A closure captures bindings (variables), not automatically frozen copies of their values. `for (var i=0; i<3; i++) setTimeout(() => console.log(i))` logs `3,3,3`, because all callbacks share one function-scoped `i`. Using `let i` creates a fresh lexical binding on each iteration, so logs are `0,1,2`. `createInput` hides mutable Sets in its lexical scope while exposing only methods.

8. **What changes with `type="module"`?** (a) Native `import`/`export` syntax becomes available; (b) modules have their own top-level scope, not global variable leakage; (c) modules run in strict mode; (d) module scripts are deferred by default; (e) external modules follow module-loading rules including CORS, and are evaluated once per resolved module; (f) top-level `this` is `undefined`. The app separates the game loop, input, pure physics and rendering into ESM modules.
