# ЛР №2 — експеримент із `this` та одним прототипним ланцюжком

Виконайте в Node.js із кореневої папки проєкту:

```bash
node --input-type=module
```

У Node REPL введіть:

```js
const { Ship } = await import('./src/sim/ship-class.js');
const { Entity } = await import('./src/sim/entity.js');
const ship = new Ship();

// Ланцюжок прототипів: це єдиний практичний експеримент.
Object.getPrototypeOf(ship) === Ship.prototype; // true
Object.getPrototypeOf(Ship.prototype) === Entity.prototype; // true
Object.getPrototypeOf(Entity.prototype) === Object.prototype; // true
Object.getPrototypeOf(Object.prototype) === null; // true
ship instanceof Ship; // true
ship instanceof Entity; // true

// `this` — 4 правила:
// 1. new -> новий об'єкт
function Pilot(name) {
  this.name = name;
}
new Pilot('Ada').name; // 'Ada'

// 2. Явне прив'язування (call / apply / bind)
function nameOf() {
  return this.name;
}
nameOf.call({ name: 'Explicit' }); // 'Explicit'
nameOf.apply({ name: 'Apply' }); // 'Apply'
const bound = nameOf.bind({ name: 'Bound' });
bound(); // 'Bound'

// 3. Неявне прив'язування (об'єкт ліворуч від крапки)
const pilot = { name: 'Object', nameOf };
pilot.nameOf(); // 'Object'

// 4. Виклик вільної функції (у strict / ESM) -> undefined
function defaultThis() {
  'use strict';
  return this;
}
defaultThis(); // undefined

// Arrow не має власного `this`, успадковує лексичне:
const outer = {
  name: 'Lexical',
  arrowFactory() {
    return () => this.name;
  },
};
const arrow = outer.arrowFactory();
arrow.call({ name: 'Ignored' }); // 'Lexical'

// Конкретний баг із лабораторної:
const rawFire = ship.fire;
try {
  rawFire();
} catch (error) {
  console.log(error.name);
} // TypeError
const safeFire = ship.fire.bind(ship);
safeFire(); // Entity(kind='bullet')
```

Для реального `keydown` DOM викликає handler з `this` рівним `currentTarget` (для `window` — це `window`), тому `addEventListener('keydown', ship.fire)` — **погано**. Фікс: `addEventListener('keydown', (e) => { if (e.code === 'Space') ship.fire(); })`, або `const fireBound = ship.fire.bind(ship); addEventListener('keydown', fireBound)` з парним `removeEventListener`. У бойовому циклі ми викликаємо `game.player.fire(...)` без відривання методу від об'єкта.

Нюанс: в `Ship.fire()` діє cooldown; виклики можна розділити `World.step(0.5)` або створювати новий екземпляр для демонстрації.
