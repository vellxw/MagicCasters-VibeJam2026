import { PLAYER_SPEED, type MoveInput } from '../../../shared/types';

const PREDICTED_SNAPSHOTS_MAX = 30;

interface PredictedSnapshot {
  x: number;
  z: number;
  rotY: number;
  time: number;
}

/**
 * Applies predicted horizontal movement (X/Z) for client-side prediction.
 * Does not predict Y (gravity/jump), which stays server-authoritative.
 */
export function applyPredictedHorizontalMovement(
  snapshot: { x: number; z: number; rotY: number },
  input: MoveInput,
  dt: number
): void {
  const forward = { x: -Math.sin(snapshot.rotY), z: -Math.cos(snapshot.rotY) };
  const right = { x: Math.cos(snapshot.rotY), z: -Math.sin(snapshot.rotY) };
  let mx = 0;
  let mz = 0;
  if (input.forward) { mx += forward.x; mz += forward.z; }
  if (input.backward) { mx -= forward.x; mz -= forward.z; }
  if (input.right) { mx += right.x; mz += right.z; }
  if (input.left) { mx -= right.x; mz -= right.z; }
  const len = Math.hypot(mx, mz);
  if (len > 0) {
    mx /= len;
    mz /= len;
  }
  snapshot.x += mx * PLAYER_SPEED * dt;
  snapshot.z += mz * PLAYER_SPEED * dt;
}

/**
 * Ring buffer of predicted snapshots for reconciliation.
 */
export class PredictionBuffer {
  private buffer: PredictedSnapshot[] = [];
  private head = 0;

  push(snapshot: PredictedSnapshot): void {
    if (this.buffer.length < PREDICTED_SNAPSHOTS_MAX) {
      this.buffer.push(snapshot);
    } else {
      this.buffer[this.head] = snapshot;
    }
    this.head = (this.head + 1) % PREDICTED_SNAPSHOTS_MAX;
  }

  /**
   * Finds the predicted snapshot closest to a given time.
   * Useful for reconciling against server state.
   */
  findNearest(time: number): PredictedSnapshot | null {
    if (this.buffer.length === 0) return null;
    let nearest = this.buffer[0];
    let minDiff = Math.abs(nearest.time - time);
    for (let i = 1; i < this.buffer.length; i++) {
      const diff = Math.abs(this.buffer[i].time - time);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = this.buffer[i];
      }
    }
    return nearest;
  }

  clear(): void {
    this.buffer.length = 0;
    this.head = 0;
  }
}

/**
 * Reconciles predicted position against server position.
 * Returns true when divergence is above the threshold.
 */
export function needsReconciliation(
  predicted: { x: number; z: number },
  server: { x: number; z: number },
  threshold = 0.5
): boolean {
  const dx = predicted.x - server.x;
  const dz = predicted.z - server.z;
  return dx * dx + dz * dz > threshold * threshold;
}

/**
 * Smoothly snaps predicted position toward server position.
 */
export function smoothReconcile(
  predicted: { x: number; z: number },
  server: { x: number; z: number },
  dt: number,
  speed = 12
): void {
  const t = Math.min(1, dt * speed);
  predicted.x += (server.x - predicted.x) * t;
  predicted.z += (server.z - predicted.z) * t;
}
