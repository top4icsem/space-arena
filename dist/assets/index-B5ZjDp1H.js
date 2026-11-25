(function () {
  const e = document.createElement('link').relList;
  if (e && e.supports && e.supports('modulepreload')) return;
  for (const o of document.querySelectorAll('link[rel="modulepreload"]')) n(o);
  new MutationObserver((o) => {
    for (const s of o)
      if (s.type === 'childList')
        for (const r of s.addedNodes) r.tagName === 'LINK' && r.rel === 'modulepreload' && n(r);
  }).observe(document, { childList: !0, subtree: !0 });
  function i(o) {
    const s = {};
    return (
      o.integrity && (s.integrity = o.integrity),
      o.referrerPolicy && (s.referrerPolicy = o.referrerPolicy),
      o.crossOrigin === 'use-credentials'
        ? (s.credentials = 'include')
        : o.crossOrigin === 'anonymous'
          ? (s.credentials = 'omit')
          : (s.credentials = 'same-origin'),
      s
    );
  }
  function n(o) {
    if (o.ep) return;
    o.ep = !0;
    const s = i(o);
    fetch(o.href, s);
  }
})();
const f = Object.freeze({ width: 1100, height: 680 });
function $(t, e) {
  return ((t % e) + e) % e;
}
function $e(t, e = f) {
  return { ...t, x: $(t.x, e.width), y: $(t.y, e.height) };
}
const N = Object.freeze({
  acceleration: 315,
  rotationRate: Math.PI * 0.93,
  drag: 0.44,
  brakeDrag: 3.8,
  maximumSpeed: 385,
});
function le(t, e) {
  return { x: t, y: e, vx: 0, vy: 0, angle: 0, thrusting: !1 };
}
function ve(t, e, i) {
  if (!Number.isFinite(i) || i < 0) throw new RangeError('dt must be a non-negative finite number');
  const n = +!!e.turnRight - +!!e.turnLeft,
    o = t.angle + n * N.rotationRate * i,
    s = !!e.thrust,
    r = s ? N.acceleration : 0;
  let a = t.vx + Math.sin(o) * r * i,
    l = t.vy - Math.cos(o) * r * i;
  const h = e.brake ? N.brakeDrag : N.drag,
    d = Math.exp(-h * i);
  ((a *= d), (l *= d));
  const c = Math.hypot(a, l);
  if (c > N.maximumSpeed) {
    const m = N.maximumSpeed / c;
    ((a *= m), (l *= m));
  }
  return {
    x: t.x + a * i,
    y: t.y + l * i,
    vx: a,
    vy: l,
    angle: Math.atan2(Math.sin(o), Math.cos(o)),
    thrusting: s,
  };
}
class p {
  constructor(e = 0, i = 0) {
    if (!Number.isFinite(e) || !Number.isFinite(i))
      throw new RangeError('Vector2 components must be finite numbers');
    ((this.x = e), (this.y = i), Object.freeze(this));
  }
  add(e) {
    return new p(this.x + e.x, this.y + e.y);
  }
  subtract(e) {
    return new p(this.x - e.x, this.y - e.y);
  }
  scale(e) {
    return new p(this.x * e, this.y * e);
  }
  get length() {
    return Math.hypot(this.x, this.y);
  }
  normalized() {
    return this.length === 0 ? new p() : this.scale(1 / this.length);
  }
  distanceTo(e) {
    return this.subtract(e).length;
  }
  rotated(e) {
    const i = Math.cos(e),
      n = Math.sin(e);
    return new p(this.x * i - this.y * n, this.x * n + this.y * i);
  }
  static fromAngle(e, i = 1) {
    return new p(Math.sin(e) * i, -Math.cos(e) * i);
  }
}
class x {
  static #e = 0;
  constructor({
    position: e = new p(),
    velocity: i = new p(),
    radius: n = 10,
    kind: o = 'entity',
    behaviors: s = [],
    team: r = 'neutral',
  } = {}) {
    if (!(e instanceof p) || !(i instanceof p))
      throw new TypeError('Entity position and velocity must be Vector2 values');
    if (!Number.isFinite(n) || n < 0) throw new RangeError('Invalid entity radius');
    ((this.id = ++x.#e),
      (this.position = e),
      (this.previousPosition = e),
      (this.velocity = i),
      (this.radius = n),
      (this.kind = o),
      (this.team = r),
      (this.behaviors = [...s]),
      (this.alive = !0));
  }
  kill() {
    this.alive = !1;
  }
  update(e, i) {
    this.previousPosition = this.position;
    for (const n of this.behaviors) {
      if (!this.alive) break;
      n.update(this, e, i);
    }
    this.alive &&
      ((this.position = this.position.add(this.velocity.scale(e))),
      (this.position = new p(
        $(this.position.x, i?.arena.width ?? f.width),
        $(this.position.y, i?.arena.height ?? f.height),
      )));
  }
}
function Se(t) {
  let e = t;
  return {
    get remaining() {
      return e;
    },
    get fraction() {
      return Math.max(0, Math.min(1, e / t));
    },
    update(i, n) {
      ((e -= n), e <= 0 && i.kill());
    },
  };
}
function Be(t) {
  return { type: 'pickup', collect: t, update() {} };
}
function ke({ target: t, turnRate: e = 2.7, speed: i = 140 }) {
  return {
    type: 'homing',
    update(n, o, s) {
      const r = t(n, s);
      if (!r?.alive) return;
      const a = s.arena.width,
        l = s.arena.height;
      let h = r.position.x - n.position.x,
        d = r.position.y - n.position.y;
      (h > a / 2 && (h -= a),
        h < -a / 2 && (h += a),
        d > l / 2 && (d -= l),
        d < -l / 2 && (d += l));
      const c = new p(h, d);
      if (c.length < 1e-9) return;
      const m = n.velocity.length > 1e-9 ? n.velocity.normalized() : c.normalized(),
        w = c.normalized(),
        E = m.x * w.y - m.y * w.x,
        L = m.x * w.x + m.y * w.y,
        b = Math.atan2(E, L),
        g = Math.max(-e * o, Math.min(e * o, b));
      n.velocity = m.rotated(g).scale(i);
    },
  };
}
function oe(t, e, i, n = () => !0) {
  let o = null,
    s = 1 / 0;
  for (const r of e.ofKind(i)) {
    if (r.id === t.id || !r.alive || !n(r)) continue;
    let a = Math.abs(r.position.x - t.position.x),
      l = Math.abs(r.position.y - t.position.y);
    ((a = Math.min(a, e.arena.width - a)), (l = Math.min(l, e.arena.height - l)));
    const h = a * a + l * l;
    h < s && ((s = h), (o = r));
  }
  return o;
}
function Ke({ position: t, velocity: e, team: i = 'player', ownerId: n = null, guided: o = !1 }) {
  const s = [Se(o ? 3.4 : 2.1)];
  o &&
    s.push(
      ke({
        speed: 380,
        turnRate: 3.6,
        target: (a, l) =>
          oe(a, l, 'ship', (d) => d.team !== i && d.id !== n) ?? oe(a, l, 'asteroid'),
      }),
    );
  const r = new x({
    kind: 'bullet',
    team: i,
    radius: o ? 6 : 4,
    position: t,
    velocity: e,
    behaviors: s,
  });
  return ((r.ownerId = n), (r.guided = o), (r.ttl = s[0]), r);
}
function pe({ position: t, velocity: e = new p(20, 12), radius: i = 27, guided: n = !1 }) {
  const o = n
      ? [
          ke({
            speed: 64,
            turnRate: 0.9,
            target: (r, a) => oe(r, a, 'ship', (l) => l.team === 'player'),
          }),
        ]
      : [],
    s = new x({ kind: 'asteroid', position: t, velocity: e, radius: i, behaviors: o });
  return (
    (s.guided = n),
    (s.durability = i > 31 ? 2 : 1),
    (s.rotation = (t.x * 0.013 + t.y * 0.004) % (Math.PI * 2)),
    s
  );
}
function me(t, { heal: e = 1, points: i = 25 } = {}) {
  return new x({
    kind: 'pickup',
    radius: 16,
    position: t,
    velocity: new p(),
    behaviors: [Be((o) => ({ healed: o.heal(e), points: i }))],
  });
}
function je({ position: t, velocity: e, color: i = '#7ae6ff', lifetime: n = 0.5, radius: o = 2 }) {
  const s = Se(n),
    r = new x({ kind: 'particle', radius: o, position: t, velocity: e, behaviors: [s] });
  return ((r.color = i), (r.ttl = s), r);
}
class Y extends x {
  #e;
  constructor({ position: e = new p(550, 340), team: i = 'player', hp: n = 3 } = {}) {
    (super({ kind: 'ship', team: i, position: e, radius: 21 }),
      (this.angle = 0),
      (this.thrusting = !1),
      (this.maxHp = n),
      (this.#e = n),
      (this.controls = { thrust: !1, brake: !1, turnLeft: !1, turnRight: !1 }),
      (this.fireCooldown = 0),
      (this.invincibleFor = 1.5));
  }
  get hp() {
    return this.#e;
  }
  setControls(e) {
    this.controls = { ...e };
  }
  damage(e = 1) {
    return !this.alive || this.invincibleFor > 0
      ? !1
      : ((this.#e = Math.max(0, this.#e - e)),
        this.#e === 0 ? this.kill() : (this.invincibleFor = 0.65),
        !0);
  }
  heal(e = 1) {
    if (!this.alive) return 0;
    const i = this.#e;
    return ((this.#e = Math.min(this.maxHp, this.#e + e)), this.#e - i);
  }
  fire({ guided: e = !1 } = {}) {
    if (!this.alive || this.fireCooldown > 0) return null;
    const i = p.fromAngle(this.angle),
      n = this.position.add(i.scale(34)),
      o = this.velocity.add(i.scale(e ? 380 : 510));
    return (
      (this.fireCooldown = e ? 0.36 : 0.19),
      Ke({ position: n, velocity: o, team: this.team, ownerId: this.id, guided: e })
    );
  }
  get flightState() {
    return {
      x: this.position.x,
      y: this.position.y,
      vx: this.velocity.x,
      vy: this.velocity.y,
      angle: this.angle,
      thrusting: this.thrusting,
    };
  }
  update(e, i) {
    ((this.previousPosition = this.position),
      (this.invincibleFor = Math.max(0, this.invincibleFor - e)),
      (this.fireCooldown = Math.max(0, this.fireCooldown - e)));
    const n = ve(
      {
        ...le(this.position.x, this.position.y),
        vx: this.velocity.x,
        vy: this.velocity.y,
        angle: this.angle,
        thrusting: this.thrusting,
      },
      this.controls,
      e,
    );
    ((this.position = new p($(n.x, i.arena.width), $(n.y, i.arena.height))),
      (this.velocity = new p(n.vx, n.vy)),
      (this.angle = n.angle),
      (this.thrusting = n.thrusting));
  }
}
function Ue(t, e, i) {
  let n = Math.abs(t.position.x - e.position.x),
    o = Math.abs(t.position.y - e.position.y);
  return (
    (n = Math.min(n, i.width - n)),
    (o = Math.min(o, i.height - o)),
    n * n + o * o <= (t.radius + e.radius) ** 2
  );
}
function ge(t, e, i, n = 1) {
  if (e.kind === 'ship') {
    const o = e.damage(n);
    return (
      o && t.emit({ type: 'ship-hit', target: e, source: i }),
      o && !e.alive && t.emit({ type: 'destroyed', target: e, source: i }),
      o
    );
  }
  return e.kind === 'asteroid'
    ? ((e.durability -= n),
      t.emit({ type: 'asteroid-hit', target: e, source: i }),
      e.durability <= 0 && (e.kill(), t.emit({ type: 'destroyed', target: e, source: i })),
      !0)
    : !1;
}
function We(t, e, i) {
  if (!e.alive || !i.alive) return;
  let n = e.kind === 'bullet' ? e : i.kind === 'bullet' ? i : null;
  if (n) {
    const r = n === e ? i : e;
    if (
      (r.kind !== 'ship' && r.kind !== 'asteroid') ||
      (r.kind === 'ship' && (r.team === n.team || r.id === n.ownerId))
    )
      return;
    ge(t, r, n) && n.kill();
    return;
  }
  const o = e.kind === 'ship' ? e : i.kind === 'ship' ? i : null;
  if (!o) return;
  const s = o === e ? i : e;
  if (s.kind === 'pickup' && o.team === 'player') {
    const r = s.behaviors.find((a) => a.type === 'pickup');
    r && (t.emit({ type: 'pickup', target: o, source: s, reward: r.collect(o) }), s.kill());
  } else
    s.kind === 'asteroid' &&
      ge(t, o, s) &&
      (s.kill(), t.emit({ type: 'destroyed', target: s, source: o }));
}
function Ge(t) {
  const e = [...t].filter((i) => i.alive && i.kind !== 'particle');
  for (let i = 0; i < e.length; i++)
    for (let n = i + 1; n < e.length; n++) {
      const o = e[i],
        s = e[n];
      o.alive && s.alive && Ue(o, s, t.arena) && We(t, o, s);
    }
}
class He {
  constructor({ arena: e = f } = {}) {
    ((this.arena = e), (this.entities = new Map()), (this.time = 0), (this.events = []));
  }
  spawn(e) {
    if (!(e instanceof x)) throw new TypeError('World.spawn expects an Entity');
    if (!e.alive) throw new Error('Cannot spawn a dead entity');
    if (this.entities.has(e.id)) throw new Error(`Entity ${e.id} already spawned`);
    return (this.entities.set(e.id, e), e);
  }
  despawn(e) {
    const i = typeof e == 'number' ? e : e.id,
      n = this.entities.get(i);
    return (n && n.kill(), !!n);
  }
  sweep() {
    for (const [e, i] of this.entities) i.alive || this.entities.delete(e);
  }
  *ofKind(e) {
    for (const i of this.entities.values()) i.alive && i.kind === e && (yield i);
  }
  [Symbol.iterator]() {
    return this.entities.values();
  }
  emit(e) {
    this.events.push(e);
  }
  step(e) {
    if (!Number.isFinite(e) || e < 0) throw new RangeError('Invalid world timestep');
    this.events = [];
    for (const i of [...this.entities.values()]) i.alive && i.update(e, this);
    return (Ge(this), this.sweep(), (this.time += e), this.events);
  }
}
function qe(t) {
  let e = t >>> 0;
  return () => ((e = (Math.imul(e, 1664525) + 1013904223) >>> 0), e / 4294967296);
}
class ze {
  constructor({ roomConfig: e = {}, eventBus: i = null } = {}) {
    ((this.roomConfig = e), (this.eventBus = i), this.reset());
  }
  notify(e, i) {
    this.eventBus?.dispatchEvent(new CustomEvent(e, { detail: i }));
  }
  reset() {
    ((this.world = new He()),
      (this.random = qe(4267)),
      (this.score = 0),
      (this.destroyedAsteroids = 0),
      (this.respawnIn = 0),
      (this.enemyRespawnIn = 0),
      (this.asteroidTimer = 0),
      (this.pickupTimer = 0),
      (this.player = this.world.spawn(new Y({ position: new p(550, 340) }))),
      (this.enemy = this.world.spawn(new Y({ position: new p(920, 120), team: 'enemy', hp: 2 }))),
      (this.enemy.angle = Math.PI));
    const e = [
        [155, 130, 29, 28, 9, !1],
        [325, 510, 37, -15, 18, !1],
        [780, 500, 24, -17, -28, !1],
        [1030, 380, 29, 24, -13, !1],
        [175, 590, 22, 42, -8, !0],
      ],
      i = Math.max(1, Math.min(10, this.roomConfig.asteroidCount ?? 5));
    for (const [n, o, s, r, a, l] of e.slice(0, i))
      this.world.spawn(pe({ position: new p(n, o), velocity: new p(r, a), radius: s, guided: l }));
    for (let n = e.length; n < i; n++) this.spawnAsteroid();
    this.world.spawn(me(new p(630, 290)));
  }
  get playerState() {
    return this.player?.alive
      ? this.player.flightState
      : { x: f.width / 2, y: f.height / 2, vx: 0, vy: 0, angle: 0, thrusting: !1 };
  }
  spawnAsteroid() {
    const e = Math.floor(this.random() * 4),
      i = e === 0 ? 20 : e === 1 ? f.width - 20 : this.random() * f.width,
      n = e === 2 ? 20 : e === 3 ? f.height - 20 : this.random() * f.height,
      o = 21 + this.random() * 18,
      s = this.random() * Math.PI * 2,
      r = this.random() < 0.25;
    this.world.spawn(
      pe({
        position: new p(i, n),
        velocity: p.fromAngle(s, 28 + this.random() * 23),
        radius: o,
        guided: r,
      }),
    );
  }
  addExplosion(e, i) {
    const n = i === 'ship' ? '#f28f7e' : i === 'pickup' ? '#81f5b7' : '#fecb8d';
    for (let o = 0; o < 17; o++) {
      const s = (o / 17) * Math.PI * 2 + this.random() * 0.32,
        r = 42 + this.random() * 185;
      this.world.spawn(
        je({
          position: e,
          velocity: new p(Math.cos(s) * r, Math.sin(s) * r),
          color: n,
          lifetime: 0.25 + this.random() * 0.55,
          radius: 1 + this.random() * 2.7,
        }),
      );
    }
  }
  driveEnemy(e) {
    if (!this.enemy?.alive) return;
    if (!this.player?.alive) {
      this.enemy.setControls({ thrust: !1, turnLeft: !1, turnRight: !1 });
      return;
    }
    let i = this.player.position.x - this.enemy.position.x,
      n = this.player.position.y - this.enemy.position.y;
    (i > f.width / 2 && (i -= f.width),
      i < -f.width / 2 && (i += f.width),
      n > f.height / 2 && (n -= f.height),
      n < -f.height / 2 && (n += f.height));
    const o = Math.atan2(i, -n),
      s = Math.atan2(Math.sin(o - this.enemy.angle), Math.cos(o - this.enemy.angle));
    if (
      (this.enemy.setControls({
        thrust: Math.hypot(i, n) > 135,
        turnLeft: s < -0.09,
        turnRight: s > 0.09,
        brake: Math.hypot(i, n) < 115,
      }),
      Math.abs(s) < 0.35 && Math.hypot(i, n) < 540)
    ) {
      const r = this.enemy.fire();
      r &&
        (this.world.spawn(r),
        this.notify('fired', { team: 'enemy', guided: !1, x: r.position.x, y: r.position.y }));
    }
  }
  simulate(e, i = {}, { shooting: n = !1, guided: o = !1 } = {}) {
    if (!Number.isFinite(e) || e < 0) throw new RangeError('Invalid game timestep');
    if (
      (this.player === null &&
        ((this.respawnIn = Math.max(0, this.respawnIn - e)),
        this.respawnIn === 0 &&
          (this.player = this.world.spawn(new Y({ position: new p(550, 340) })))),
      this.enemy === null &&
        ((this.enemyRespawnIn = Math.max(0, this.enemyRespawnIn - e)),
        this.enemyRespawnIn === 0 &&
          ((this.enemy = this.world.spawn(
            new Y({ position: new p(940, 130), team: 'enemy', hp: 2 }),
          )),
          (this.enemy.angle = Math.PI))),
      this.player?.setControls(i),
      this.driveEnemy(e),
      n && this.player?.alive)
    ) {
      const a = this.player.fire({ guided: o });
      a &&
        (this.world.spawn(a),
        this.notify('fired', { team: 'player', guided: o, x: a.position.x, y: a.position.y }));
    }
    const s = this.world.step(e);
    for (const a of s)
      ((a.type === 'ship-hit' || a.type === 'asteroid-hit') &&
        this.notify('hit', { kind: a.target.kind, team: a.target.team ?? null }),
        a.type === 'destroyed'
          ? (this.notify('exploded', { kind: a.target.kind, team: a.target.team ?? null }),
            this.addExplosion(a.target.position, a.target.kind),
            a.target.kind === 'asteroid'
              ? (this.destroyedAsteroids++,
                a.source?.kind === 'bullet' && a.source.team === 'player' && (this.score += 50))
              : a.target.kind === 'ship' && a.target.team === 'enemy' && (this.score += 200),
            a.target === this.player && ((this.respawnIn = 2), (this.player = null)),
            a.target === this.enemy && ((this.enemyRespawnIn = 4), (this.enemy = null)))
          : a.type === 'pickup' &&
            (this.addExplosion(a.source.position, 'pickup'),
            this.notify('collected', { points: a.reward.points }),
            a.target.team === 'player' && (this.score += a.reward.points)));
    this.asteroidTimer += e;
    const r = Math.max(1, this.roomConfig.asteroidRespawnSeconds ?? 3.4);
    return (
      this.asteroidTimer >= r &&
        ((this.asteroidTimer -= r),
        [...this.world.ofKind('asteroid')].length < 8 && this.spawnAsteroid()),
      (this.pickupTimer += e),
      this.pickupTimer >= 8 &&
        ((this.pickupTimer -= 8),
        [...this.world.ofKind('pickup')].length === 0 &&
          this.world.spawn(me(new p(180 + this.random() * 740, 100 + this.random() * 470)))),
      s
    );
  }
  get hud() {
    const e = { bullets: 0, asteroids: 0, pickups: 0, particles: 0 };
    for (const i of this.world) {
      const n = `${i.kind}s`;
      n in e && e[n]++;
    }
    return {
      score: this.score,
      hp: this.player?.hp ?? 0,
      maxHp: 3,
      respawnIn: this.respawnIn,
      destroyedAsteroids: this.destroyedAsteroids,
      ...e,
    };
  }
}
const Ye = new Map([
    ['ArrowUp', 'KeyW'],
    ['ArrowLeft', 'KeyA'],
    ['ArrowDown', 'KeyS'],
    ['ArrowRight', 'KeyD'],
  ]),
  Xe = new Set([
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Space',
  ]);
function Je(t = window) {
  const e = new Set(),
    i = new Set();
  function n(a) {
    return Ye.get(a) ?? a;
  }
  function o(a) {
    Xe.has(a.code) &&
      !['INPUT', 'TEXTAREA', 'SELECT'].includes(a.target?.tagName) &&
      a.preventDefault();
    const l = n(a.code);
    (e.has(l) || i.add(l), e.add(l));
  }
  function s(a) {
    e.delete(n(a.code));
  }
  function r() {
    (e.clear(), i.clear());
  }
  return (
    t.addEventListener('keydown', o),
    t.addEventListener('keyup', s),
    t.addEventListener('blur', r),
    {
      isDown(a) {
        return e.has(n(a));
      },
      justPressed(a) {
        return i.has(n(a));
      },
      snapshot() {
        return {
          thrust: e.has('KeyW'),
          turnLeft: e.has('KeyA'),
          turnRight: e.has('KeyD'),
          brake: e.has('KeyS'),
        };
      },
      endStep() {
        i.clear();
      },
      dispose() {
        (t.removeEventListener('keydown', o),
          t.removeEventListener('keyup', s),
          t.removeEventListener('blur', r),
          r());
      },
    }
  );
}
function Qe({
  simulate: t,
  render: e,
  onStats: i = () => {},
  fixedDt: n = 1 / 60,
  maxFrameDelta: o = 0.25,
  maxStepsPerFrame: s = 8,
  scheduler: r = 'raf',
  variableTimestep: a = !1,
  blockEvery60Frames: l = !1,
}) {
  let h = !1,
    d = null,
    c = null,
    m = 0,
    w = 0,
    E = 0,
    L = null,
    b = 0,
    g = { fps: 0, stepsPerSecond: 0, frameMs: 0, totalFrames: 0 };
  function C(P) {
    if (!h) return;
    (c === null && (c = P), L === null && (L = P));
    const F = Math.max(0, (P - c) / 1e3),
      ie = Math.min(F, o);
    c = P;
    let W = 0;
    if (a) ie > 0 && (t(ie), (W = 1));
    else {
      for (m += ie; m >= n && W < s;) (t(n), (m -= n), W++);
      W === s && m >= n && (m %= n);
    }
    const Oe = a ? 1 : m / n;
    if ((e(Oe, g, P), l && (b + 1) % 60 === 0)) {
      const De = performance.now() + 100;
      for (; performance.now() < De;);
    }
    (w++, b++, (E += W));
    const ne = P - L;
    (ne >= 1e3
      ? ((g = {
          fps: (w * 1e3) / ne,
          stepsPerSecond: (E * 1e3) / ne,
          frameMs: F * 1e3,
          totalFrames: b,
        }),
        i(g),
        (w = 0),
        (E = 0),
        (L = P))
      : (g = { ...g, frameMs: F * 1e3, totalFrames: b }),
      r === 'raf' && h && (d = requestAnimationFrame(C)));
  }
  function U() {
    h ||
      ((h = !0),
      (c = null),
      (L = null),
      (m = 0),
      (w = 0),
      (E = 0),
      r === 'interval'
        ? (d = setInterval(() => C(performance.now()), 16))
        : (d = requestAnimationFrame(C)));
  }
  function z() {
    h && ((h = !1), r === 'interval' ? clearInterval(d) : cancelAnimationFrame(d), (d = null));
  }
  return { start: U, stop: z, isRunning: () => h, getStats: () => ({ ...g }) };
}
function Ze(t, e = f) {
  const i = t.getContext('2d', { alpha: !1 });
  if (!i) throw new Error('Your browser does not support Canvas 2D');
  let n = 1,
    o = 1,
    s = 0,
    r = 0;
  function a() {
    const d = t.getBoundingClientRect(),
      c = Math.max(d.width, 1),
      m = Math.max(d.height, 1);
    n = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.round(c * n),
      E = Math.round(m * n);
    (t.width !== w && (t.width = w),
      t.height !== E && (t.height = E),
      (o = Math.min(c / e.width, m / e.height)),
      (s = (c - e.width * o) / 2),
      (r = (m - e.height * o) / 2));
  }
  function l() {
    (Math.min(window.devicePixelRatio || 1, 3) !== n && a(),
      i.setTransform(1, 0, 0, 1, 0, 0),
      (i.fillStyle = '#060d1a'),
      i.fillRect(0, 0, t.width, t.height),
      i.setTransform(n * o, 0, 0, n * o, n * s, n * r));
  }
  const h = new ResizeObserver(a);
  return (
    h.observe(t),
    window.addEventListener('resize', a),
    a(),
    {
      ctx: i,
      beginFrame: l,
      dispose() {
        (h.disconnect(), window.removeEventListener('resize', a));
      },
    }
  );
}
function ye(t, e, i) {
  return t + (e - t) * i;
}
function Ve(t, e, i) {
  const n = Math.atan2(Math.sin(e - t), Math.cos(e - t));
  return t + n * i;
}
function J(t, e, i, n) {
  let o = e - t;
  return (o > n / 2 && (o -= n), o < -n / 2 && (o += n), $(t + o * i, n));
}
function _e(t, e, i, n = f) {
  return {
    x: J(t.x, e.x, i, n.width),
    y: J(t.y, e.y, i, n.height),
    vx: ye(t.vx, e.vx, i),
    vy: ye(t.vy, e.vy, i),
    angle: Ve(t.angle, e.angle, i),
    thrusting: e.thrusting,
  };
}
function et(t) {
  let e = t >>> 0;
  return () => ((e = (Math.imul(e, 1664525) + 1013904223) >>> 0), e / 4294967296);
}
function tt() {
  const t = document.createElement('canvas');
  ((t.width = f.width), (t.height = f.height));
  const e = t.getContext('2d'),
    { width: i, height: n } = f,
    o = e.createLinearGradient(0, 0, i, n);
  (o.addColorStop(0, '#0b1830'),
    o.addColorStop(0.52, '#091426'),
    o.addColorStop(1, '#091020'),
    (e.fillStyle = o),
    e.fillRect(0, 0, i, n));
  const s = e.createRadialGradient(200, 140, 0, 200, 140, 440);
  (s.addColorStop(0, 'rgba(37, 76, 138, .24)'),
    s.addColorStop(1, 'rgba(37, 76, 138, 0)'),
    (e.fillStyle = s),
    e.fillRect(0, 0, i, n));
  const r = e.createRadialGradient(950, 560, 0, 950, 560, 370);
  (r.addColorStop(0, 'rgba(60, 66, 153, .17)'),
    r.addColorStop(1, 'rgba(60, 66, 153, 0)'),
    (e.fillStyle = r),
    e.fillRect(0, 0, i, n),
    (e.strokeStyle = 'rgba(114, 154, 211, .055)'),
    (e.lineWidth = 1));
  for (let l = 0; l <= i; l += 44)
    (e.beginPath(), e.moveTo(l + 0.5, 0), e.lineTo(l + 0.5, n), e.stroke());
  for (let l = 0; l <= n; l += 44)
    (e.beginPath(), e.moveTo(0, l + 0.5), e.lineTo(i, l + 0.5), e.stroke());
  ((e.strokeStyle = 'rgba(116, 182, 226, .09)'), e.setLineDash([5, 12]), (e.lineWidth = 1));
  for (const l of [120, 245, 370])
    (e.beginPath(), e.arc(i / 2, n / 2, l, 0, Math.PI * 2), e.stroke());
  (e.setLineDash([]),
    e.beginPath(),
    e.moveTo(i / 2 - 18, n / 2),
    e.lineTo(i / 2 + 18, n / 2),
    e.moveTo(i / 2, n / 2 - 18),
    e.lineTo(i / 2, n / 2 + 18),
    (e.strokeStyle = 'rgba(91, 164, 218, .17)'),
    e.stroke());
  const a = et(103053);
  for (let l = 0; l < 164; l++) {
    const h = a() * i,
      d = a() * n,
      c = 0.45 + a() * 1.5,
      m = 0.13 + a() * 0.6;
    ((e.fillStyle = `rgba(178, 213, 255, ${m})`),
      e.beginPath(),
      e.arc(h, d, c, 0, Math.PI * 2),
      e.fill(),
      l % 23 === 0 &&
        ((e.strokeStyle = `rgba(174, 207, 246, ${m * 0.7})`),
        e.beginPath(),
        e.moveTo(h - 5, d),
        e.lineTo(h + 5, d),
        e.moveTo(h, d - 5),
        e.lineTo(h, d + 5),
        e.stroke()));
  }
  return (
    (e.strokeStyle = 'rgba(75, 154, 210, .12)'),
    e.setLineDash([7, 8]),
    e.strokeRect(15.5, 15.5, i - 31, n - 31),
    e.setLineDash([]),
    t
  );
}
function ee(t, e, i, n) {
  return e ? (t.drawImage(e, i * 96, 0, 96, 96, -n / 2, -n / 2, n, n), !0) : !1;
}
function it(t, e) {
  const i = 2 + Math.sin(e / 65) * 3;
  (t.save(), (t.shadowColor = '#24bdfa'), (t.shadowBlur = 27));
  const n = t.createLinearGradient(0, 13, 0, 56);
  (n.addColorStop(0, '#f8fdff'),
    n.addColorStop(0.25, '#70f6f2'),
    n.addColorStop(0.7, '#2f94f7'),
    n.addColorStop(1, 'rgba(100, 50, 255, 0)'),
    (t.fillStyle = n),
    t.beginPath(),
    t.moveTo(-7, 15),
    t.quadraticCurveTo(-5, 32, 0, 51 + i),
    t.quadraticCurveTo(6, 34, 7, 15),
    t.closePath(),
    t.fill(),
    t.restore());
}
function Me(t, e, i, n, o, s, r, a = 'player') {
  if (
    (t.save(),
    t.translate(e, i),
    t.rotate(n),
    (t.strokeStyle = 'rgba(85, 211, 250, .18)'),
    (t.lineWidth = 1.3),
    t.beginPath(),
    t.arc(0, 0, 39, 0, Math.PI * 2),
    t.stroke(),
    (t.strokeStyle = 'rgba(85, 211, 250, .32)'),
    t.beginPath(),
    t.arc(0, 0, 39, Math.PI * 1.72, Math.PI * 1.93),
    t.stroke(),
    t.beginPath(),
    t.arc(0, 0, 39, Math.PI * 0.72, Math.PI * 0.93),
    t.stroke(),
    o && it(t, s),
    r?.ships)
  ) {
    ((t.shadowColor = a === 'enemy' ? '#ff7797' : '#55cafa'),
      (t.shadowBlur = 17),
      ee(t, r.ships, a === 'enemy' ? 1 : 0, 79),
      t.restore());
    return;
  }
  ((t.shadowColor = '#4bc6ff'), (t.shadowBlur = 22));
  const l = t.createLinearGradient(-21, -30, 22, 25);
  (l.addColorStop(0, '#bedafa'),
    l.addColorStop(0.44, '#edfaff'),
    l.addColorStop(1, '#66a6d5'),
    (t.fillStyle = l),
    (t.strokeStyle = '#91e5ff'),
    (t.lineWidth = 1.7),
    t.beginPath(),
    t.moveTo(0, -30),
    t.lineTo(21, 22),
    t.lineTo(5, 14),
    t.lineTo(0, 9),
    t.lineTo(-5, 14),
    t.lineTo(-21, 22),
    t.closePath(),
    t.fill(),
    t.stroke(),
    (t.shadowBlur = 0),
    (t.fillStyle = '#123452'),
    t.beginPath(),
    t.moveTo(0, -17),
    t.lineTo(7, 6),
    t.quadraticCurveTo(0, 13, -7, 6),
    t.closePath(),
    t.fill(),
    (t.fillStyle = '#68ebf9'),
    t.beginPath(),
    t.ellipse(0, -3, 3.2, 9, 0, 0, Math.PI * 2),
    t.fill(),
    (t.strokeStyle = '#247ea7'),
    (t.lineWidth = 2),
    t.beginPath(),
    t.moveTo(-14, 15),
    t.lineTo(-7, 9),
    t.moveTo(14, 15),
    t.lineTo(7, 9),
    t.stroke(),
    (t.fillStyle = '#7ef2ff'),
    t.fillRect(-4, 13, 8, 4),
    t.restore());
}
function nt(t, e, i, n, o, s) {
  (t.save(), t.translate(i, n), t.rotate(e.rotation + o * 12e-5 * (e.guided ? -1 : 1)));
  const r = e.radius;
  if (s?.asteroids) {
    ((t.shadowColor = e.guided ? '#ff8165' : '#a8b9d2'),
      (t.shadowBlur = e.guided ? 21 : 10),
      ee(t, s.asteroids, e.guided ? 1 : 0, r * 2.45),
      t.restore());
    return;
  }
  ((t.shadowColor = e.guided ? '#ff835c' : '#90aed5'), (t.shadowBlur = e.guided ? 24 : 10));
  const a = t.createLinearGradient(-r, -r, r, r);
  (a.addColorStop(0, e.guided ? '#a45743' : '#718ba3'),
    a.addColorStop(0.5, e.guided ? '#582f41' : '#334b68'),
    a.addColorStop(1, '#101a2e'),
    (t.fillStyle = a),
    (t.strokeStyle = e.guided ? '#ffac7a' : '#a3b9cc'),
    (t.lineWidth = 1.8),
    t.beginPath());
  for (let l = 0; l < 9; l++) {
    const h = (l * Math.PI * 2) / 9,
      d = r * (0.82 + 0.15 * Math.sin(l * 7.4 + e.id)),
      c = Math.cos(h) * d,
      m = Math.sin(h) * d;
    l === 0 ? t.moveTo(c, m) : t.lineTo(c, m);
  }
  (t.closePath(),
    t.fill(),
    t.stroke(),
    (t.shadowBlur = 0),
    (t.strokeStyle = e.guided ? '#f69c72' : '#728ba5'),
    t.beginPath(),
    t.ellipse(-r * 0.21, -r * 0.1, r * 0.23, r * 0.12, 0.4, 0, Math.PI * 2),
    t.moveTo(r * 0.12, r * 0.25),
    t.arc(r * 0.1, r * 0.21, r * 0.2, 0, 1.9 * Math.PI),
    t.stroke(),
    e.guided &&
      ((t.fillStyle = '#ffac6c'), t.beginPath(), t.arc(0, 0, 4, 0, Math.PI * 2), t.fill()),
    t.restore());
}
function ot(t, e, i, n, o) {
  if (o?.bullets) {
    (t.save(),
      t.translate(i, n),
      t.rotate(Math.atan2(e.velocity.y, e.velocity.x) + Math.PI / 2),
      (t.shadowColor = e.team === 'enemy' ? '#ff8191' : '#80fff2'),
      (t.shadowBlur = 15),
      ee(t, o.bullets, e.team === 'enemy' ? 2 : e.guided ? 1 : 0, e.guided ? 39 : 32),
      t.restore());
    return;
  }
  (t.save(),
    (t.shadowBlur = e.guided ? 25 : 15),
    (t.shadowColor = e.team === 'enemy' ? '#ff697e' : e.guided ? '#d6b3ff' : '#82f9f3'),
    (t.fillStyle = e.team === 'enemy' ? '#ff8191' : e.guided ? '#d8aeff' : '#92fff2'),
    (t.strokeStyle = t.fillStyle),
    (t.lineWidth = e.guided ? 3.5 : 2.5));
  const s = e.velocity.normalized();
  (t.beginPath(),
    t.moveTo(i - s.x * (e.guided ? 17 : 13), n - s.y * (e.guided ? 17 : 13)),
    t.lineTo(i + s.x * 5, n + s.y * 5),
    t.stroke(),
    t.beginPath(),
    t.arc(i, n, e.radius, 0, Math.PI * 2),
    t.fill(),
    t.restore());
}
function rt(t, e, i, n, o) {
  (t.save(), t.translate(e, i));
  const s = 1 + Math.sin(n / 230) * 0.14;
  if ((t.scale(s, s), o?.pickups)) {
    ((t.shadowColor = '#80ffb8'), (t.shadowBlur = 22), ee(t, o.pickups, 0, 47), t.restore());
    return;
  }
  (t.rotate(Math.PI / 4),
    (t.shadowColor = '#80ffb8'),
    (t.shadowBlur = 26),
    (t.fillStyle = '#163b37'),
    (t.strokeStyle = '#88ffc9'),
    (t.lineWidth = 3),
    t.fillRect(-12, -12, 24, 24),
    t.strokeRect(-12, -12, 24, 24),
    t.rotate(-Math.PI / 4),
    (t.fillStyle = '#8dffbd'),
    t.fillRect(-3, -9, 6, 18),
    t.fillRect(-9, -3, 18, 6),
    t.restore());
}
function we(t, e, i, n, o) {
  const s = J(e.previousPosition.x, e.position.x, i, f.width),
    r = J(e.previousPosition.y, e.position.y, i, f.height);
  for (const a of [-f.width, 0, f.width])
    for (const l of [-f.height, 0, f.height]) {
      const h = s + a,
        d = r + l;
      h < -65 ||
        h > f.width + 65 ||
        d < -65 ||
        d > f.height + 65 ||
        (e.kind === 'ship'
          ? (t.save(),
            e.invincibleFor > 0 && (t.globalAlpha = 0.76 + 0.24 * (0.5 + 0.5 * Math.sin(n / 120))),
            e.team === 'enemy' && !o?.ships && (t.filter = 'hue-rotate(148deg) saturate(1.5)'),
            Me(t, h, d, e.angle, e.thrusting, n, o, e.team),
            t.restore())
          : e.kind === 'asteroid'
            ? nt(t, e, h, d, n, o)
            : e.kind === 'bullet'
              ? ot(t, e, h, d, o)
              : e.kind === 'pickup'
                ? rt(t, h, d, n, o)
                : e.kind === 'particle' &&
                  (t.save(),
                  (t.globalAlpha = e.ttl.fraction),
                  (t.fillStyle = e.color),
                  (t.shadowColor = e.color),
                  (t.shadowBlur = 9),
                  t.beginPath(),
                  t.arc(h, d, e.radius, 0, Math.PI * 2),
                  t.fill(),
                  t.restore()));
    }
}
function st(t, { sprites: e = {} } = {}) {
  const i = tt(),
    { ctx: n } = t;
  return {
    render(o, s, r, a, l = null) {
      if ((t.beginFrame(), n.drawImage(i, 0, 0), l)) {
        for (const h of l) h.kind !== 'ship' && we(n, h, r, a, e);
        for (const h of l.ofKind('ship')) we(n, h, r, a, e);
      } else {
        const h = _e(o, s, r);
        for (const d of [-f.width, 0, f.width])
          for (const c of [-f.height, 0, f.height])
            Me(n, h.x + d, h.y + c, h.angle, h.thrusting, a, e);
      }
    },
  };
}
class Ee extends Error {
  constructor(e, i) {
    (super(`HTTP ${e} while loading ${i}`),
      (this.name = 'HttpError'),
      (this.status = e),
      (this.url = i));
  }
}
function Q(t) {
  return t?.reason instanceof Error
    ? t.reason
    : new DOMException('Operation aborted', 'AbortError');
}
function Ce(t, e) {
  return e?.aborted
    ? Promise.reject(Q(e))
    : new Promise((i, n) => {
        const o = () => {
            (clearTimeout(r), e?.removeEventListener('abort', s));
          },
          s = () => {
            (o(), n(Q(e)));
          },
          r = setTimeout(() => {
            (o(), i());
          }, t);
        e?.addEventListener('abort', s, { once: !0 });
      });
}
async function at(
  t,
  { signal: e, attempts: i = 3, baseDelayMs: n = 180, random: o = Math.random } = {},
) {
  if (!Number.isInteger(i) || i < 1) throw new RangeError('attempts must be positive');
  for (let s = 0; s < i; s++) {
    if (e?.aborted) throw Q(e);
    try {
      return await t(s);
    } catch (r) {
      if (e?.aborted) throw Q(e);
      if (
        (r instanceof Ee && r.status >= 400 && r.status < 500) ||
        r instanceof SyntaxError ||
        (r?.name === 'AbortError' && r?.name !== 'TimeoutError') ||
        s === i - 1
      )
        throw r;
      const a = n * 2 ** s;
      await Ce(a + o() * a * 0.35, e);
    }
  }
  throw new Error('Retry loop exhausted');
}
async function he(
  t,
  {
    signal: e,
    fetchImpl: i = fetch,
    timeoutMs: n = 5e3,
    attempts: o = 3,
    baseDelayMs: s = 180,
  } = {},
) {
  return at(
    async () => {
      const r = AbortSignal.timeout(n),
        a = e ? AbortSignal.any([e, r]) : r,
        l = await i(t, { signal: a, cache: 'no-store' });
      if (!l.ok) throw new Ee(l.status, t);
      return l;
    },
    { signal: e, attempts: o, baseDelayMs: s },
  );
}
async function de(t, e = {}) {
  return (await he(t, e)).json();
}
async function Pe(t, e = {}) {
  return de(t, e);
}
async function Le(t, { decodeImage: e = lt, ...i } = {}) {
  const n = await he(t, i);
  return e(await n.blob());
}
async function lt(t) {
  return typeof createImageBitmap == 'function'
    ? createImageBitmap(t)
    : new Promise((e, i) => {
        const n = URL.createObjectURL(t),
          o = new Image();
        ((o.onload = () => {
          (URL.revokeObjectURL(n), e(o));
        }),
          (o.onerror = () => {
            (URL.revokeObjectURL(n), i(new Error('Image decode failed')));
          }),
          (o.src = n));
      });
}
async function Te(t, { decodeAudio: e = ht, ...i } = {}) {
  const n = await he(t, i);
  return e(await n.arrayBuffer());
}
async function ht(t) {
  return new OfflineAudioContext(1, 1, 44100).decodeAudioData(t);
}
async function Ae(t, { signal: e, onProgress: i = () => {}, ...n } = {}) {
  if (!Array.isArray(t?.assets) || !t.assets.length)
    throw new Error('manifest.assets must be a nonempty array');
  const o = new Set(),
    s = { images: {}, audio: {}, json: {} };
  let r = 0;
  const a = t.assets.length;
  return (
    i({ completed: r, total: a, fraction: 0, file: 'Starting downloads' }),
    await Promise.all(
      t.assets.map(async (l) => {
        if (!l.id || !l.url || !['image', 'audio', 'json'].includes(l.type))
          throw new Error('Invalid manifest entry');
        if (o.has(l.id)) throw new Error(`Duplicate asset id: ${l.id}`);
        o.add(l.id);
        const h =
            l.type === 'image'
              ? await Le(l.url, { signal: e, ...n })
              : l.type === 'audio'
                ? await Te(l.url, { signal: e, ...n })
                : await Pe(l.url, { signal: e, ...n }),
          d = l.type === 'image' ? 'images' : l.type === 'audio' ? 'audio' : 'json';
        ((s[d][l.id] = h), r++, i({ completed: r, total: a, fraction: r / a, file: l.url }));
      }),
    ),
    s
  );
}
async function dt(t, e = {}) {
  const i = performance.now();
  for (const r of t.assets)
    await (r.type === 'image' ? Le : r.type === 'audio' ? Te : Pe)(r.url, e);
  const n = performance.now() - i,
    o = performance.now();
  await Ae(t, e);
  const s = performance.now() - o;
  return { sequentialMs: n, concurrentMs: s, files: t.assets.length };
}
function ut(t, e) {
  const i = {};
  return (
    (t === 'timeout' || t === 'abort') &&
      (i.fetchImpl = (n, { signal: o }) =>
        String(n).includes('ships.png')
          ? new Promise((s, r) => {
              if (o.aborted) {
                r(o.reason);
                return;
              }
              o.addEventListener('abort', () => r(o.reason), { once: !0 });
            })
          : fetch(n, { signal: o, cache: 'no-store' })),
    t === 'timeout' && (i.timeoutMs = 350),
    t === 'abort' &&
      setTimeout(
        () => e.abort(new DOMException('Demo: cancelled while assets loaded', 'AbortError')),
        280,
      ),
    i
  );
}
function ft(t, e) {
  const i = structuredClone(t);
  return (
    e === '404' && (i.assets.find((n) => n.id === 'ships').url = '/assets/sprites/404-missing.png'),
    e === 'json' && (i.assets.find((n) => n.id === 'arena-rules').url = '/assets/data/broken.json'),
    i
  );
}
function ct(t) {
  let e = null,
    i = {},
    n = !1;
  function o() {
    if (!e) {
      const r = window.AudioContext || window.webkitAudioContext;
      if (!r) return !1;
      e = new r();
    }
    return (e.state === 'suspended' && e.resume(), !0);
  }
  function s(r, a = 0.18) {
    if (!e || n || !i[r] || e.state !== 'running') return;
    const l = e.createBufferSource(),
      h = e.createGain();
    ((l.buffer = i[r]),
      (h.gain.value = a),
      l.connect(h),
      h.connect(e.destination),
      l.start(),
      (l.onended = () => {
        (l.disconnect(), h.disconnect());
      }));
  }
  return (
    t.addEventListener('fired', (r) => {
      r.detail.team === 'player' && s('fire', r.detail.guided ? 0.19 : 0.13);
    }),
    t.addEventListener('hit', () => s('hit', 0.12)),
    t.addEventListener('exploded', () => s('explosion', 0.17)),
    {
      setBuffers(r) {
        i = r;
      },
      unlock: o,
      setMuted(r) {
        n = !!r;
      },
      get muted() {
        return n;
      },
      get unlocked() {
        return e?.state === 'running';
      },
      close() {
        (e && e.close(), (e = null));
      },
    }
  );
}
class pt extends EventTarget {
  constructor({
    endpoint: e = '/api/rooms',
    intervalMs: i = 5e3,
    timeoutMs: n = 2400,
    fetchImpl: o = fetch,
  } = {}) {
    (super(),
      (this.endpoint = e),
      (this.intervalMs = i),
      (this.timeoutMs = n),
      (this.fetchImpl = o),
      (this.rooms = []),
      (this.visible = !1),
      (this.pollTimer = null),
      (this.inFlight = null),
      (this.generation = 0));
  }
  async refresh() {
    if (!this.visible) return this.rooms;
    if (this.inFlight) return this.rooms;
    const e = new AbortController();
    this.inFlight = e;
    const i = this.generation,
      n = AbortSignal.any([e.signal, AbortSignal.timeout(this.timeoutMs)]);
    try {
      const o = await de(this.endpoint, { signal: n, fetchImpl: this.fetchImpl, attempts: 1 });
      if (!Array.isArray(o?.rooms)) throw new Error('Room list has no rooms array');
      return !this.visible || i !== this.generation
        ? this.rooms
        : ((this.rooms = o.rooms),
          this.dispatchEvent(new CustomEvent('rooms', { detail: this.rooms })),
          this.rooms);
    } catch (o) {
      return (
        this.visible &&
          i === this.generation &&
          !e.signal.aborted &&
          this.dispatchEvent(new CustomEvent('roomerror', { detail: o })),
        this.rooms
      );
    } finally {
      this.inFlight === e && (this.inFlight = null);
    }
  }
  start() {
    this.visible ||
      ((this.visible = !0),
      this.generation++,
      this.refresh(),
      (this.pollTimer = setInterval(() => {
        this.refresh();
      }, this.intervalMs)));
  }
  stop() {
    ((this.visible = !1),
      this.generation++,
      clearInterval(this.pollTimer),
      (this.pollTimer = null),
      this.inFlight?.abort(new DOMException('Left the lobby', 'AbortError')),
      (this.inFlight = null),
      this.dispatchEvent(new Event('stopped')));
  }
  join(e, i) {
    const n = String(e).trim().slice(0, 20),
      o = this.rooms.find((s) => s.id === i);
    if (!n) throw new Error('Enter your pilot name');
    if (!o) throw new Error('Choose an available room');
    if (o.players >= o.maxPlayers) throw new Error('This room is full');
    (this.stop(), this.dispatchEvent(new CustomEvent('join', { detail: { name: n, room: o } })));
  }
  async *updates({ signal: e } = {}) {
    const i = [];
    let n;
    const o = (s) => {
      (i.push(s.detail), n?.());
    };
    this.addEventListener('rooms', o);
    try {
      for (this.rooms.length && (yield this.rooms); !e?.aborted && this.visible;) {
        if (
          !i.length &&
          (await Promise.race([
            new Promise((s) => {
              n = s;
            }),
            Ce(this.intervalMs + 100, e).catch(() => {}),
          ]),
          (n = null),
          e?.aborted || !this.visible)
        )
          return;
        for (; i.length;) yield i.shift();
      }
    } finally {
      this.removeEventListener('rooms', o);
    }
  }
}
function mt(t, { onJoin: e, onRetry: i, onBack: n, onSound: o } = {}) {
  const s = (b) => t.querySelector(b),
    r = s('#room-grid'),
    a = s('#lobby-message'),
    l = s('#pilot-name'),
    h = s('#join-game');
  let d = null,
    c = [];
  function m(b) {
    ((c = b),
      c.some((g) => g.id === d && g.players < g.maxPlayers) ||
        (d = c.find((g) => g.players < g.maxPlayers)?.id ?? null),
      r.replaceChildren());
    for (const g of c) {
      const C = document.createElement('button');
      ((C.type = 'button'),
        (C.className = 'room-card' + (g.id === d ? ' selected' : '')),
        (C.disabled = g.players >= g.maxPlayers),
        C.setAttribute('aria-pressed', String(g.id === d)));
      const U = document.createElement('span');
      U.className = 'room-card-top';
      const z = document.createElement('strong');
      z.textContent = g.name;
      const P = document.createElement('small');
      ((P.textContent = `${g.players}/${g.maxPlayers} PILOTS`), U.append(z, P));
      const F = document.createElement('span');
      ((F.className = 'room-description'),
        (F.textContent = g.description),
        C.append(U, F),
        C.addEventListener('click', () => {
          ((d = g.id), m(c));
        }),
        r.append(C));
    }
    ((h.disabled = !d),
      (a.textContent = `Rooms synced · ${c.length} sectors available · auto refresh every 5s`),
      a.classList.remove('lobby-error'));
  }
  function w(b) {
    ((a.textContent = b), a.classList.add('lobby-error'));
  }
  function E() {
    ((t.hidden = !1), (l.value = l.value || 'Pilot'));
  }
  function L() {
    t.hidden = !0;
  }
  return (
    s('#lobby-form').addEventListener('submit', (b) => {
      (b.preventDefault(), d && e?.(l.value, d));
    }),
    s('#refresh-rooms').addEventListener('click', () => i?.()),
    s('#leave-arena').addEventListener('click', () => n?.()),
    s('#sound-toggle').addEventListener('click', () => o?.()),
    {
      show: E,
      hide: L,
      error: w,
      renderRooms: m,
      get selected() {
        return d;
      },
    }
  );
}
function re(t, { completed: e = 0, total: i = 1, file: n = 'Connecting...' } = {}) {
  t.beginFrame();
  const o = t.ctx,
    { width: s, height: r } = f,
    a = Math.max(0, Math.min(1, e / i)),
    l = o.createLinearGradient(0, 0, s, r);
  (l.addColorStop(0, '#08172e'),
    l.addColorStop(1, '#111d37'),
    (o.fillStyle = l),
    o.fillRect(0, 0, s, r),
    (o.strokeStyle = '#1d3f59'));
  for (let c = 0; c <= s; c += 44) (o.beginPath(), o.moveTo(c, 0), o.lineTo(c, r), o.stroke());
  for (let c = 0; c <= r; c += 44) (o.beginPath(), o.moveTo(0, c), o.lineTo(s, c), o.stroke());
  ((o.textAlign = 'center'),
    (o.fillStyle = '#86e9e4'),
    (o.font = '700 16px ui-monospace, monospace'),
    o.fillText('SPACE ARENA  //  ASSET PIPELINE', s / 2, 258),
    (o.fillStyle = '#f3f9ff'),
    (o.font = '800 38px system-ui, sans-serif'),
    o.fillText('Initializing sector...', s / 2, 317));
  const h = s / 2 - 245,
    d = 362;
  ((o.fillStyle = '#1b3044'),
    o.fillRect(h, d, 490, 15),
    (o.fillStyle = '#66e9e7'),
    (o.shadowBlur = 12),
    (o.shadowColor = '#50e7d9'),
    o.fillRect(h, d, 490 * a, 15),
    (o.shadowBlur = 0),
    (o.fillStyle = '#a9c9d5'),
    (o.font = '13px ui-monospace, monospace'),
    o.fillText(`${e} / ${i} RESOURCES  ·  ${Math.round(a * 100)}%`, s / 2, 412),
    (o.fillStyle = '#6987a0'),
    (o.font = '12px ui-monospace, monospace'),
    o.fillText(String(n).slice(-67), s / 2, 445));
}
function gt(t, e) {
  re(t, { completed: 0, total: 1, file: 'Asset error — retry to continue' });
  const i = t.ctx;
  ((i.textAlign = 'center'),
    (i.fillStyle = '#ffb4a8'),
    (i.font = '700 15px system-ui, sans-serif'),
    i.fillText(String(e).slice(0, 85), f.width / 2, 505));
}
const u = (t) => document.querySelector(t),
  Z = new URLSearchParams(window.location.search),
  I = ['block', 'interval', 'variable'].includes(Z.get('experiment')) ? Z.get('experiment') : null,
  A = Z.get('autothrust') === '1';
let se = Z.get('failure');
const ue = u('#arena'),
  G = Ze(ue),
  T = Je(),
  Re = new EventTarget(),
  S = ct(Re),
  R = new pt();
let M = null,
  H = null,
  V = null,
  X = null,
  fe = null,
  ae = '',
  k = 'loading',
  K = null,
  O = null,
  y = le(f.width / 2, f.height / 2),
  q = { ...y },
  j = 0,
  _ = !1,
  v = !1,
  be = 0;
const D = mt(u('#lobby-overlay'), {
  onJoin: (t, e) => {
    S.unlock();
    try {
      R.join(t, e);
    } catch (i) {
      D.error(i.message);
    }
  },
  onRetry: () => {
    R.refresh();
  },
  onSound: () => {
    (S.setMuted(!S.muted),
      (u('#sound-toggle').textContent = `♪ SOUND: ${S.muted ? 'OFF' : 'ON'}`),
      (u('#mute-button').lastElementChild.textContent = S.muted ? 'Sound off' : 'Sound on'));
  },
});
function te() {
  k === 'playing' &&
    ((M = new ze({ roomConfig: fe, eventBus: Re })),
    (y = A ? le(f.width / 2, f.height / 2) : M.playerState),
    (q = { ...y }),
    (j = 0),
    (_ = !1),
    T.endStep(),
    (u('#experiment-alert').hidden = !I && !A),
    Ie());
}
function yt(t) {
  if (k === 'playing' && !(A && _)) {
    if ((T.justPressed('KeyR') && !A && te(), (q = { ...y }), A)) {
      const e = Math.min(t, Math.max(0, 5 - j));
      if (
        ((y = $e(ve(y, { thrust: !0, brake: !1, turnLeft: !1, turnRight: !1 }, e))),
        (j += e),
        j >= 5 - 1e-9)
      ) {
        _ = !0;
        const i = {
          experiment: I || 'fixed',
          simSeconds: Number(j.toFixed(4)),
          x: Number(y.x.toFixed(4)),
          y: Number(y.y.toFixed(4)),
          velocity: Number(Math.hypot(y.vx, y.vy).toFixed(4)),
        };
        (console.info('[SPACE ARENA] Lab 01 5-second benchmark', i),
          (u('#experiment-alert').hidden = !1),
          (u('#experiment-alert').textContent =
            `5.00s benchmark: x=${i.x}, y=${i.y}, speed=${i.velocity}.`));
      }
    } else
      (M.simulate(t, T.snapshot(), {
        shooting: T.isDown('Space'),
        guided: T.isDown('ShiftLeft') || T.isDown('ShiftRight'),
      }),
        (y = M.playerState));
    T.endStep();
  }
}
function Ie() {
  if (k !== 'playing') return;
  const t = Math.hypot(y.vx, y.vy),
    e = ((((y.angle * 180) / Math.PI) % 360) + 360) % 360;
  ((u('#speed').textContent = Math.round(t)),
    (u('#speed-bar').style.width = `${Math.min(100, (t / N.maximumSpeed) * 100)}%`),
    (u('#heading').textContent = Math.round(e)),
    (u('#heading-arrow').style.transform = `rotate(${y.angle}rad)`),
    (u('#position').textContent = `${Math.round(y.x)} : ${Math.round(y.y)}`),
    (u('#canvas-coordinates').innerHTML =
      `X ${String(Math.round(y.x)).padStart(4, '0')} <span>/</span> Y ${String(Math.round(y.y)).padStart(4, '0')}`),
    (u('#thrust-indicator').textContent = y.thrusting ? 'ENGAGED' : 'IDLE'),
    u('#thrust-indicator').classList.toggle('engaged', y.thrusting));
  for (const i of ['w', 'a', 's', 'd'])
    u(`#key-${i}`).classList.toggle('pressed', T.isDown(`Key${i.toUpperCase()}`));
  if (!A && M) {
    const i = M.hud;
    ((u('#score').textContent = i.score.toLocaleString('en-US')),
      (u('#health').textContent = `${'♥'.repeat(i.hp)}${'♡'.repeat(i.maxHp - i.hp)}`),
      (u('#asteroids').textContent = String(i.asteroids)),
      (u('#bullets').textContent = String(i.bullets)),
      (u('#respawn-status').textContent =
        i.respawnIn > 0 ? `RESPAWN ${i.respawnIn.toFixed(1)}s` : 'READY'));
  }
}
const B = Qe({
  simulate: yt,
  render(t, e, i) {
    k !== 'playing' ||
      !H ||
      (H.render(q, y, t, i, A ? null : M.world),
      i - be > 90 && ((be = i), (u('#frame-time').textContent = e.frameMs.toFixed(1)), Ie()));
  },
  onStats: (t) => {
    ((u('#frames-per-second').textContent = Math.round(t.fps)),
      (u('#steps-per-second').textContent = Math.round(t.stepsPerSecond)));
  },
  scheduler: I === 'interval' ? 'interval' : 'raf',
  variableTimestep: I === 'variable',
  blockEvery60Frames: I === 'block',
});
function xe(t) {
  k === 'playing' &&
    ((v = t),
    v ? B.stop() : B.start(),
    (u('#pause-overlay').hidden = !v),
    (u('#pause-label').textContent = v ? 'Resume simulation' : 'Pause simulation'),
    (u('#pause-icon').textContent = v ? '▶' : 'Ⅱ'),
    u('#pause-button').setAttribute('aria-pressed', String(v)),
    (u('#system-status').textContent = v ? 'SYSTEM PAUSED' : 'SYSTEM ONLINE'),
    u('.online-pill').classList.toggle('is-paused', v),
    u('.flight-tag').classList.toggle('is-paused', v),
    v || ue.focus({ preventScroll: !0 }));
}
async function ce() {
  ((k = 'lobby'),
    B.stop(),
    (v = !1),
    (u('#pause-overlay').hidden = !0),
    H.render(q, y, 1, 0, null),
    D.show(),
    (u('#system-status').textContent = 'ROOMS ONLINE'),
    (O = new AbortController()),
    R.addEventListener('roomerror', Fe),
    R.start(),
    (async () => {
      try {
        for await (const t of R.updates({ signal: O.signal })) D.renderRooms(t);
      } catch (t) {
        O.signal.aborted || D.error(t.message);
      }
    })());
}
function Fe(t) {
  D.error(`Network error: ${t.detail.message}. Try REFRESH; the previous list stays available.`);
}
R.addEventListener('join', ({ detail: t }) => {
  if (
    (O && O.abort(),
    R.removeEventListener('roomerror', Fe),
    D.hide(),
    (fe = t.room),
    (ae = t.name),
    (k = 'playing'),
    (u('#sector-label').textContent = t.room.name.toUpperCase()),
    (u('.arena-lower-left').textContent = `✧ ${ae.toUpperCase()} / ${t.room.name.toUpperCase()}`),
    (u('#system-status').textContent = 'SYSTEM ONLINE'),
    te(),
    I)
  ) {
    const e = {
      block: 'Lab 01: 100 ms event-loop block',
      interval: 'Lab 01: timer scheduler',
      variable: 'Lab 01: variable timestep',
    };
    ((u('#experiment-alert').textContent = e[I]), (u('#experiment-alert').hidden = !1));
  }
  (A &&
    ((u('#experiment-alert').hidden = !1),
    (u('#experiment-alert').textContent = 'Lab 01 automated 5-second trajectory benchmark.')),
    H.render(q, y, 1, 0, A ? null : M.world),
    B.start(),
    ue.focus({ preventScroll: !0 }));
});
async function Ne() {
  (K?.abort(), (K = new AbortController()));
  const t = K.signal;
  ((k = 'loading'),
    B.stop(),
    R.stop(),
    O?.abort(),
    D.hide(),
    (u('#asset-failure').hidden = !0),
    (u('#pause-overlay').hidden = !0),
    (u('#system-status').textContent = 'LOADING ASSETS'),
    re(G, { completed: 0, total: 1, file: '/assets/manifest.json' }));
  try {
    V = await de('/assets/manifest.json', { signal: t });
    const e = ft(V, se),
      i = ut(se, K);
    if (
      ((X = await Ae(e, {
        ...i,
        signal: t,
        onProgress: ({ completed: n, total: o, file: s }) =>
          re(G, { completed: n, total: o, file: s }),
      })),
      t.aborted)
    )
      return;
    ((H = st(G, { sprites: X.images })), S.setBuffers(X.audio), await ce());
  } catch (e) {
    if (t.aborted && k !== 'loading') return;
    (K.abort(),
      console.warn('[Space Arena] Recoverable asset error:', e),
      gt(G, e.message),
      (u('#asset-error-message').textContent = `${e.name}: ${e.message}`),
      (u('#asset-failure').hidden = !1),
      (u('#system-status').textContent = 'LOAD FAILED'));
  }
}
u('#retry-assets').addEventListener('click', () => {
  const t = new URL(location.href);
  (t.searchParams.delete('failure'), (se = null), history.replaceState(null, '', t), Ne());
});
u('#pause-button').addEventListener('click', () => xe(!v));
u('#reset-button').addEventListener('click', te);
u('#back-to-lobby').addEventListener('click', () => {
  k === 'playing' && ce();
});
u('#mute-button').addEventListener('click', () => {
  (S.unlock(),
    S.setMuted(!S.muted),
    (u('#mute-button').lastElementChild.textContent = S.muted ? 'Sound off' : 'Sound on'),
    (u('#sound-toggle').textContent = `♪ SOUND: ${S.muted ? 'OFF' : 'ON'}`),
    u('#mute-button').setAttribute('aria-pressed', String(S.muted)));
});
window.addEventListener('keydown', (t) => {
  k === 'playing' &&
    (t.code === 'KeyP' && !t.repeat && !['INPUT', 'TEXTAREA'].includes(t.target?.tagName) && xe(!v),
    t.code === 'KeyR' && v && te());
});
window.__spaceArenaDebug = Object.freeze({
  getState: () => ({ ...y, simulatedSeconds: j, benchmarkComplete: _, phase: k, pilotName: ae }),
  getStats: () => B.getStats(),
  getMode: () => I || 'fixed',
  getWorld: () =>
    M
      ? {
          score: M.score,
          hud: { ...M.hud },
          entities: [...M.world].map((t) => ({
            id: t.id,
            kind: t.kind,
            x: t.position.x,
            y: t.position.y,
            alive: t.alive,
          })),
        }
      : null,
  getThisDemo: () => ({ methodOwner: 'Ship', example: 'player.fire.bind(player)' }),
  getLoadStatus: () => ({
    phase: k,
    assets: V?.assets.length || 0,
    loaded: !!X,
    room: fe?.id,
    audioUnlocked: S.unlocked,
  }),
  compareAssetLoading: () => dt(V),
  returnToLobby: () => {
    k === 'playing' && ce();
  },
});
Ne();
window.addEventListener('pagehide', () => {
  (K?.abort(), O?.abort(), R.stop(), B.stop(), T.dispose(), S.close(), G.dispose());
});
