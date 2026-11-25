const KEY_MAP = new Map([
  ['ArrowUp', 'KeyW'],
  ['ArrowLeft', 'KeyA'],
  ['ArrowDown', 'KeyS'],
  ['ArrowRight', 'KeyD'],
]);
const CONTROL_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

/** Keeps state private inside a closure; justPressed is edge-triggered. */
export function createInput(target = window) {
  const down = new Set();
  const pressedThisStep = new Set();

  function normalize(code) {
    return KEY_MAP.get(code) ?? code;
  }

  function onKeyDown(event) {
    if (CONTROL_KEYS.has(event.code) && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) {
      event.preventDefault();
    }
    const key = normalize(event.code);
    if (!down.has(key)) pressedThisStep.add(key);
    down.add(key);
  }

  function onKeyUp(event) {
    down.delete(normalize(event.code));
  }

  function clear() {
    down.clear();
    pressedThisStep.clear();
  }

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', clear);

  return {
    isDown(code) { return down.has(normalize(code)); },
    justPressed(code) { return pressedThisStep.has(normalize(code)); },
    snapshot() {
      return {
        thrust: down.has('KeyW'),
        turnLeft: down.has('KeyA'),
        turnRight: down.has('KeyD'),
        brake: down.has('KeyS'),
      };
    },
    endStep() { pressedThisStep.clear(); },
    dispose() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', clear);
      clear();
    },
  };
}
