import test from 'node:test';
import assert from 'node:assert/strict';
import { entityId, stepId, inputSeq, entityLabel } from '../types.ts';
import type { EntityId, InputSeq, Vector2, SnapshotEntity } from '../types.ts';

test('branded IDs are safe at the runtime boundary', () => {
  assert.equal(entityId(7), 7);
  assert.equal(stepId(11), 11);
  assert.equal(inputSeq(4), 4);
  assert.throws(() => entityId(-1), /Invalid entity ID/);
  assert.throws(() => inputSeq(0.4), /Invalid input sequence/);
});
test('discriminated kind dispatches to exhaustive handler', () => {
  const pickup: SnapshotEntity = { kind: 'pickup', id: entityId(4), x: 3, y: 7 };
  assert.equal(entityLabel(pickup), 'Pickup 4');
});
// TypeScript must reject these lines when @ts-expect-error is removed.
function compileTimeProof(_id: EntityId, _seq: InputSeq, _point: Vector2): void {
  if (_point.x === Number.POSITIVE_INFINITY) {
    // @ts-expect-error InputSeq is not EntityId
    const invalidId: EntityId = _seq;
    // @ts-expect-error Vector2 fields are readonly
    _point.x = 10;
    console.log(invalidId);
  }
}
void compileTimeProof;
