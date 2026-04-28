import type { MoveInput } from '../../../shared/types';

export interface TouchVector {
  x: number;
  y: number;
}

export type TouchMovement = Pick<MoveInput, 'forward' | 'backward' | 'left' | 'right'>;

const STICK_RADIUS = 54;
const STICK_DEAD_ZONE = 12;
const MOVE_AXIS_THRESHOLD = 0.38;
const CAMERA_YAW_SENSITIVITY = 0.0035;
const CAMERA_PITCH_SENSITIVITY = 0.0028;
const RIGHT_TAP_MAX_MOVEMENT = 10;

export class TouchControls {
  readonly element: HTMLDivElement;

  private stickEl: HTMLDivElement;
  private knobEl: HTMLDivElement;
  private movementPointerId: number | null = null;
  private lookPointerId: number | null = null;
  private movementOrigin: TouchVector = { x: 0, y: 0 };
  private movementDelta: TouchVector = { x: 0, y: 0 };
  private lookStartPoint: TouchVector = { x: 0, y: 0 };
  private lastLookPoint: TouchVector = { x: 0, y: 0 };
  private lookHasDragged = false;
  private pendingCameraDelta = { yaw: 0, pitch: 0 };
  private actionQueued = false;

  constructor(parent: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'touch-layer';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.innerHTML = `
      <div class="touch-stick" data-touch-stick>
        <div class="touch-stick__knob" data-touch-stick-knob></div>
      </div>
    `;
    parent.appendChild(this.element);

    this.stickEl = this.element.querySelector('[data-touch-stick]')!;
    this.knobEl = this.element.querySelector('[data-touch-stick-knob]')!;

    this.element.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.element.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.element.addEventListener('pointerup', (event) => this.onPointerEnd(event));
    this.element.addEventListener('pointercancel', (event) => this.onPointerEnd(event));
    this.element.addEventListener('lostpointercapture', (event) => this.onPointerEnd(event as PointerEvent));
  }

  getMovement(): TouchMovement {
    return movementFromStickDelta(this.movementDelta);
  }

  consumeCameraDelta(): { yaw: number; pitch: number } {
    const delta = this.pendingCameraDelta;
    this.pendingCameraDelta = { yaw: 0, pitch: 0 };
    return delta;
  }

  consumeActionQueued(): boolean {
    const queued = this.actionQueued;
    this.actionQueued = false;
    return queued;
  }

  reset(): void {
    this.movementPointerId = null;
    this.lookPointerId = null;
    this.movementDelta = { x: 0, y: 0 };
    this.lookHasDragged = false;
    this.pendingCameraDelta = { yaw: 0, pitch: 0 };
    this.actionQueued = false;
    this.hideStick();
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse') return;
    if ((event.target as HTMLElement).closest('button, input, select, textarea, a')) return;

    const bounds = this.element.getBoundingClientRect();
    const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    const isLeftHalf = point.x < bounds.width / 2;

    if (isLeftHalf && this.movementPointerId === null) {
      this.movementPointerId = event.pointerId;
      this.movementOrigin = point;
      this.movementDelta = { x: 0, y: 0 };
      this.showStick(point);
      this.capturePointer(event.pointerId);
      event.preventDefault();
      return;
    }

    if (!isLeftHalf && this.lookPointerId === null) {
      this.lookPointerId = event.pointerId;
      this.lookStartPoint = point;
      this.lastLookPoint = point;
      this.lookHasDragged = false;
      this.capturePointer(event.pointerId);
      event.preventDefault();
    }
  }

  private onPointerMove(event: PointerEvent): void {
    if (event.pointerType === 'mouse') return;
    const bounds = this.element.getBoundingClientRect();
    const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };

    if (event.pointerId === this.movementPointerId) {
      this.movementDelta = {
        x: point.x - this.movementOrigin.x,
        y: point.y - this.movementOrigin.y
      };
      this.updateStickKnob();
      event.preventDefault();
      return;
    }

    if (event.pointerId === this.lookPointerId) {
      if (this.lookHasDragged || !isTapGesture(this.lookStartPoint, point)) {
        this.lookHasDragged = true;
        const delta = cameraDeltaFromDrag(point.x - this.lastLookPoint.x, point.y - this.lastLookPoint.y);
        this.pendingCameraDelta.yaw += delta.yaw;
        this.pendingCameraDelta.pitch += delta.pitch;
      }
      this.lastLookPoint = point;
      event.preventDefault();
    }
  }

  private onPointerEnd(event: PointerEvent): void {
    if (event.pointerId === this.movementPointerId) {
      this.movementPointerId = null;
      this.movementDelta = { x: 0, y: 0 };
      this.hideStick();
    }

    if (event.pointerId === this.lookPointerId) {
      const point = this.pointFromEvent(event);
      const completedTap = event.type === 'pointerup'
        && !this.lookHasDragged
        && isTapGesture(this.lookStartPoint, point);
      if (completedTap) {
        this.actionQueued = true;
      }
      this.lookPointerId = null;
      this.lookHasDragged = false;
    }
  }

  private showStick(point: TouchVector): void {
    this.stickEl.dataset.active = 'true';
    this.stickEl.style.left = `${point.x}px`;
    this.stickEl.style.top = `${point.y}px`;
    this.updateStickKnob();
  }

  private hideStick(): void {
    this.stickEl.dataset.active = 'false';
    this.knobEl.style.transform = 'translate(-50%, -50%)';
  }

  private updateStickKnob(): void {
    const knob = normalizeStickDelta(this.movementDelta, STICK_RADIUS);
    this.knobEl.style.transform = `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`;
  }

  private capturePointer(pointerId: number): void {
    try {
      this.element.setPointerCapture(pointerId);
    } catch {
      // Synthetic browser tests may not create capturable pointers; real touches still capture.
    }
  }

  private pointFromEvent(event: PointerEvent): TouchVector {
    const bounds = this.element.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }
}

export function movementFromStickDelta(delta: TouchVector, deadZone = STICK_DEAD_ZONE): TouchMovement {
  const distance = Math.hypot(delta.x, delta.y);
  if (distance < deadZone) {
    return { forward: false, backward: false, left: false, right: false };
  }

  const nx = delta.x / distance;
  const ny = delta.y / distance;
  return {
    forward: ny < -MOVE_AXIS_THRESHOLD,
    backward: ny > MOVE_AXIS_THRESHOLD,
    left: nx < -MOVE_AXIS_THRESHOLD,
    right: nx > MOVE_AXIS_THRESHOLD
  };
}

export function normalizeStickDelta(delta: TouchVector, radius = STICK_RADIUS): TouchVector {
  const distance = Math.hypot(delta.x, delta.y);
  if (distance <= radius || distance === 0) {
    return { x: round(delta.x), y: round(delta.y) };
  }

  const scale = radius / distance;
  return {
    x: round(delta.x * scale),
    y: round(delta.y * scale)
  };
}

export function cameraDeltaFromDrag(movementX: number, movementY: number): { yaw: number; pitch: number } {
  return {
    yaw: round(-movementX * CAMERA_YAW_SENSITIVITY),
    pitch: round(-movementY * CAMERA_PITCH_SENSITIVITY)
  };
}

export function isTapGesture(start: TouchVector, end: TouchVector, maxMovement = RIGHT_TAP_MAX_MOVEMENT): boolean {
  return Math.hypot(end.x - start.x, end.y - start.y) <= maxMovement;
}

function round(value: number): number {
  return Math.round(value * 1000000) / 1000000;
}
