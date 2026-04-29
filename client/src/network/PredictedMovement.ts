import { PLAYER_SPEED, type MoveInput } from '../../../shared/types';

const PREDICTED_SNAPSHOTS_MAX = 30;

interface PredictedSnapshot {
  x: number;
  z: number;
  rotY: number;
  time: number;
}

/**
 * Aplica movimiento horizontal predicho (X/Z) para client-side prediction.
 * No predice Y (gravedad/salto) — eso sigue siendo autoridad del servidor.
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
 * Buffer circular de snapshots predichos para reconciliación.
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
   * Busca el snapshot predicho más cercano a un tiempo dado.
   * Útil para reconciliar contra estado del servidor.
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
 * Reconcilia posición predicha con posición del servidor.
 * Si la divergencia es mayor al threshold, devuelve true (necesita corrección).
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
 * Realiza un snap suave de predicted hacia server.
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
