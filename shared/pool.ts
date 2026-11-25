/** Bounded reusable storage. No undefined entities escape into the world. */
export class ObjectPool<T> {
  private readonly spare: T[] = [];
  readonly maxSize: number;
  readonly create: () => T;
  constructor(create: () => T, maxSize = 512) {
    if (!Number.isInteger(maxSize) || maxSize < 0) throw new RangeError('Invalid pool capacity');
    this.create = create;
    this.maxSize = maxSize;
  }
  acquire(): T {
    return this.spare.pop() ?? this.create();
  }
  release(value: T): void {
    if (this.spare.length < this.maxSize) this.spare.push(value);
  }
  get available(): number {
    return this.spare.length;
  }
}
