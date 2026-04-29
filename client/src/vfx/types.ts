import * as THREE from 'three';
import { BaseEmitter } from './emitters/BaseEmitter';

export type CurveType = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'sine' | 'pulse';

export interface AnimatedValue {
  value: number | [number, number, number];
  curve?: CurveType;
  duration?: number;
  delay?: number;
}

export type VfxColor = string | { start: string; end: string; curve?: CurveType };

export type GeometryType = 'sphere' | 'box' | 'cylinder' | 'torus' | 'ring' | 'icosahedron' | 'plane';

export interface GeometryDef {
  type: GeometryType;
  params: number[];
}

export type MaterialType = 'basic' | 'standard' | 'shader';

export interface MaterialDef {
  type: MaterialType;
  color: VfxColor;
  emissive?: VfxColor;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number | AnimatedValue;
  wireframe?: boolean;
  side?: 'front' | 'back' | 'double';
  roughness?: number;
  metalness?: number;
}

export type AttachPoint =
  | 'world'
  | 'caster_root'
  | 'caster_hand_left'
  | 'caster_hand_right'
  | 'caster_head'
  | 'projectile'
  | 'impact_point';

export interface MeshLayer {
  type: 'mesh';
  geometry: GeometryDef;
  material: MaterialDef;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number] | AnimatedValue;
  animation?: {
    rotation?: { speed?: [number, number, number]; axis?: [number, number, number]; angle?: AnimatedValue };
    scale?: AnimatedValue;
    opacity?: AnimatedValue;
  };
}

export interface LightLayer {
  type: 'light';
  lightType: 'point' | 'spot';
  color: VfxColor;
  intensity: number | AnimatedValue;
  distance: number;
  decay?: number;
  position?: [number, number, number];
}

export interface ParticleLayer {
  type: 'particles';
  count: number;
  emissionRate: number;
  emissionShape: 'point' | 'sphere' | 'cone' | 'disc';
  emissionShapeParams?: number[];
  lifetime: { min: number; max: number };
  color: { start: string; end: string };
  size: { start: number; end: number };
  opacity: { start: number; end: number };
  velocity: {
    initial: [number, number, number];
    spread: number;
    radial?: boolean;
  };
  gravity?: [number, number, number];
  drag?: number;
  burst?: boolean;
}

export interface TrailLayer {
  type: 'trail';
  width: number | AnimatedValue;
  color: VfxColor;
  length: number;
  fadeTime: number;
  taper?: boolean;
}

export type VfxLayer = MeshLayer | LightLayer | ParticleLayer | TrailLayer;

export interface VfxDefinition {
  id: string;
  name: string;
  duration: number;
  loop: boolean;
  attachTo: AttachPoint;
  layers: VfxLayer[];
}

export type PhaseType = 'cast' | 'release' | 'impact' | 'charge';

export interface SequencePhase {
  phase: PhaseType;
  delay: number;
  vfxId: string;
  attachTo?: AttachPoint;
  spawnAt?: AttachPoint;
}

export interface VfxSequence {
  id: string;
  name: string;
  type: 'sequence';
  phases: SequencePhase[];
}

export type VfxLibraryEntry = VfxDefinition | VfxSequence;

export interface VfxInstance {
  id: string;
  definitionId: string;
  definition: VfxDefinition;
  group: THREE.Group;
  startTime: number;
  elapsed: number;
  loop: boolean;
  attachTo?: AttachPoint;
  targetObject?: THREE.Object3D;
  emitters: BaseEmitter[];
}
