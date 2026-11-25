/** Nominal IDs guard against mixing otherwise identical numeric parameters. */
export type EntityId = number & { readonly __brand: 'EntityId' };
export type StepId = number & { readonly __brand: 'StepId' };
export type InputSeq = number & { readonly __brand: 'InputSeq' };

// The only three assertions in the TypeScript migration are at validated brand boundaries.
export function entityId(value: number): EntityId {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff)
    throw new RangeError('Invalid entity ID');
  return value as EntityId; // Branded ID: validated number becomes an EntityId.
}
export function stepId(value: number): StepId {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff)
    throw new RangeError('Invalid simulation step');
  return value as StepId; // Branded tick: validated number becomes a StepId.
}
export function inputSeq(value: number): InputSeq {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff)
    throw new RangeError('Invalid input sequence');
  return value as InputSeq; // Branded sequence: validated number becomes an InputSeq.
}

export interface Vector2 {
  readonly x: number;
  readonly y: number;
}
export interface FlightState extends Vector2 {
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
  readonly thrusting: boolean;
}
export interface Controls {
  readonly thrust?: boolean;
  readonly turnLeft?: boolean;
  readonly turnRight?: boolean;
  readonly brake?: boolean;
  readonly fire?: boolean;
  readonly guided?: boolean;
}
export interface ArenaSize {
  readonly width: number;
  readonly height: number;
}
export interface PlayerRecord extends FlightState {
  readonly kind: 'ship';
  readonly id: EntityId;
  readonly hp: number;
  readonly score: number;
  readonly alive: boolean;
  readonly respawn: number;
}
export interface BulletRecord extends Vector2 {
  readonly kind: 'bullet';
  readonly id: EntityId;
  readonly ownerId: EntityId;
  readonly vx: number;
  readonly vy: number;
  readonly guided: boolean;
}
export interface AsteroidRecord extends Vector2 {
  readonly kind: 'asteroid';
  readonly id: EntityId;
  readonly radius: number;
  readonly hp: number;
  readonly guided: boolean;
}
export interface PickupRecord extends Vector2 {
  readonly kind: 'pickup';
  readonly id: EntityId;
}
export type SnapshotEntity = PlayerRecord | BulletRecord | AsteroidRecord | PickupRecord;
export interface Snapshot {
  readonly tick: StepId;
  readonly ack: InputSeq;
  readonly players: readonly PlayerRecord[];
  readonly bullets: readonly BulletRecord[];
  readonly asteroids: readonly AsteroidRecord[];
  readonly pickups: readonly PickupRecord[];
}
export interface WireInput {
  readonly seq: InputSeq;
  readonly mask: number;
}
export function assertNever(value: never): never {
  throw new Error(`Unexpected variant: ${JSON.stringify(value)}`);
}
/** A generic, readonly helper: readers cannot mutate entities in a network snapshot. */
export function selectKind<K extends SnapshotEntity['kind']>(
  entities: readonly SnapshotEntity[],
  kind: K,
): readonly Extract<SnapshotEntity, { kind: K }>[] {
  return entities.filter(
    (entity): entity is Extract<SnapshotEntity, { kind: K }> => entity.kind === kind,
  );
}

/** The never branch makes missing entity-kind handlers a compiler error. */
export function entityLabel(entity: SnapshotEntity): string {
  switch (entity.kind) {
    case 'ship':
      return `Ship ${entity.id}`;
    case 'bullet':
      return `Bullet ${entity.id}`;
    case 'asteroid':
      return `Asteroid ${entity.id}`;
    case 'pickup':
      return `Pickup ${entity.id}`;
    default:
      return assertNever(entity);
  }
}
