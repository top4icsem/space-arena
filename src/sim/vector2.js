/** Immutable two-dimensional vector. Every arithmetic method returns a NEW Vector2. */
export class Vector2 {
  constructor(x = 0, y = 0) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new RangeError('Vector2 components must be finite numbers');
    }
    this.x = x;
    this.y = y;
    Object.freeze(this);
  }

  add(other) { return new Vector2(this.x + other.x, this.y + other.y); }
  subtract(other) { return new Vector2(this.x - other.x, this.y - other.y); }
  scale(scalar) { return new Vector2(this.x * scalar, this.y * scalar); }
  get length() { return Math.hypot(this.x, this.y); }
  normalized() { return this.length === 0 ? new Vector2() : this.scale(1 / this.length); }
  distanceTo(other) { return this.subtract(other).length; }
  rotated(radians) {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return new Vector2(this.x * cos - this.y * sin, this.x * sin + this.y * cos);
  }

  static fromAngle(angle, length = 1) {
    // Ship heading 0 points upwards, matching the original Lab 01 controls.
    return new Vector2(Math.sin(angle) * length, -Math.cos(angle) * length);
  }
}
