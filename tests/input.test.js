import test from 'node:test';
import assert from 'node:assert/strict';
import { createInput } from '../src/input.js';

function keyboardEvent(code) {
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperty(event, 'code', { value: code });
  return event;
}
function keyUp(code) {
  const event = new Event('keyup');
  Object.defineProperty(event, 'code', { value: code });
  return event;
}

test('input closure tracks pressed and edge-triggered keys separately', () => {
  const target = new EventTarget();
  const input = createInput(target);
  assert.equal(input.isDown('KeyW'), false);
  target.dispatchEvent(keyboardEvent('KeyW'));
  assert.equal(input.isDown('KeyW'), true);
  assert.equal(input.justPressed('KeyW'), true);
  input.endStep();
  assert.equal(input.isDown('KeyW'), true);
  assert.equal(input.justPressed('KeyW'), false);
  target.dispatchEvent(keyboardEvent('KeyW'));
  assert.equal(input.justPressed('KeyW'), false);
  target.dispatchEvent(keyUp('KeyW'));
  target.dispatchEvent(keyboardEvent('KeyW'));
  assert.equal(input.justPressed('KeyW'), true);
  input.dispose();
});

test('arrow keys alias to WASD and snapshot remains plain data', () => {
  const target = new EventTarget();
  const input = createInput(target);
  target.dispatchEvent(keyboardEvent('ArrowUp'));
  target.dispatchEvent(keyboardEvent('ArrowLeft'));
  assert.equal(input.snapshot().thrust, true);
  assert.equal(input.snapshot().turnLeft, true);
  assert.equal(input.isDown('KeyW'), true);
  target.dispatchEvent(keyUp('ArrowUp'));
  assert.equal(input.snapshot().thrust, false);
  input.dispose();
});

test('blur clears keys and dispose removes all listeners', () => {
  const target = new EventTarget();
  const input = createInput(target);
  target.dispatchEvent(keyboardEvent('KeyD'));
  target.dispatchEvent(new Event('blur'));
  assert.equal(input.isDown('KeyD'), false);
  assert.equal(input.justPressed('KeyD'), false);
  input.dispose();
  target.dispatchEvent(keyboardEvent('KeyD'));
  assert.equal(input.isDown('KeyD'), false);
});
