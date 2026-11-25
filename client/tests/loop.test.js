import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoop } from '../src/loop.js';

function withFakeAnimationFrame(fn) {
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const queue = [];
  let lastId = 0;
  globalThis.requestAnimationFrame = (cb) => {
    const id = ++lastId;
    queue.push({ id, cb });
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => {
    const index = queue.findIndex((entry) => entry.id === id);
    if (index >= 0) queue.splice(index, 1);
  };
  try {
    fn((timestamp) => {
      const next = queue.shift();
      assert.ok(next, 'an animation callback should be scheduled');
      next.cb(timestamp);
    }, queue);
  } finally {
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
}

test('fixed-step loop keeps ~60 simulation steps at 120 render frames/s', () => {
  withFakeAnimationFrame((runFrame) => {
    let physicsSteps = 0;
    let renders = 0;
    const alphas = [];
    const loop = createLoop({
      simulate: (dt) => {
        assert.equal(dt, 1 / 60);
        physicsSteps++;
      },
      render: (alpha) => {
        renders++;
        alphas.push(alpha);
      },
    });
    loop.start();
    for (let frame = 0; frame <= 120; frame++) runFrame((frame * 1000) / 120);
    assert.equal(renders, 121);
    assert.ok(physicsSteps >= 59 && physicsSteps <= 60);
    assert.ok(alphas.every((alpha) => alpha >= -1e-9 && alpha < 1 + 1e-9));
    loop.stop();
  });
});

test('large stalls are clamped and cannot trigger more than 8 steps in one frame', () => {
  withFakeAnimationFrame((runFrame) => {
    let physicsSteps = 0;
    const loop = createLoop({
      simulate: () => {
        physicsSteps++;
      },
      render: () => {},
    });
    loop.start();
    runFrame(0);
    runFrame(10_000);
    assert.equal(physicsSteps, 8);
    loop.stop();
  });
});

test('the loop does not continue scheduling frames after stop', () => {
  withFakeAnimationFrame((runFrame, queue) => {
    const loop = createLoop({ simulate: () => {}, render: () => {} });
    loop.start();
    assert.equal(queue.length, 1);
    runFrame(0);
    assert.equal(queue.length, 1);
    loop.stop();
    assert.equal(queue.length, 0);
    assert.equal(loop.isRunning(), false);
  });
});
