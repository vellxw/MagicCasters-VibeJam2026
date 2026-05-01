import * as THREE from 'three';
import { MAX_HP } from '../../../shared/types';

export type CombatRelation = 'self' | 'ally' | 'enemy' | 'neutral';

export interface CombatRelationInput {
  playerId: string;
  playerTeamId?: string | null;
  localSessionId?: string | null;
  localTeamId?: string | null;
}

export interface CombatIdentityStyle {
  badge: string;
  accentHex: string;
  accentColor: number;
  healthStart: string;
  healthEnd: string;
  ringOpacity: number;
  showNameplate: boolean;
}

export interface CombatNameplateTextureOptions {
  name: string;
  hp: number;
  relation: CombatRelation;
}

const RELATION_STYLES: Record<CombatRelation, CombatIdentityStyle> = {
  self: {
    badge: 'YOU',
    accentHex: '#f5c45e',
    accentColor: 0xf5c45e,
    healthStart: '#79b56b',
    healthEnd: '#f5c45e',
    ringOpacity: 0.46,
    showNameplate: false
  },
  ally: {
    badge: 'ALLY',
    accentHex: '#7dd3fc',
    accentColor: 0x7dd3fc,
    healthStart: '#2dd4bf',
    healthEnd: '#7dd3fc',
    ringOpacity: 0.56,
    showNameplate: true
  },
  enemy: {
    badge: 'ENEMY',
    accentHex: '#ff6b35',
    accentColor: 0xff6b35,
    healthStart: '#e34d38',
    healthEnd: '#ffb07c',
    ringOpacity: 0.62,
    showNameplate: true
  },
  neutral: {
    badge: 'MAGE',
    accentHex: '#f7e7c6',
    accentColor: 0xf7e7c6,
    healthStart: '#79b56b',
    healthEnd: '#f5c45e',
    ringOpacity: 0.36,
    showNameplate: true
  }
};

export function resolveCombatRelation(input: CombatRelationInput): CombatRelation {
  if (input.localSessionId && input.playerId === input.localSessionId) {
    return 'self';
  }

  if (!input.localSessionId || !input.localTeamId || !input.playerTeamId) {
    return 'neutral';
  }

  return input.playerTeamId === input.localTeamId ? 'ally' : 'enemy';
}

export function clampHealthRatio(hp: number, maxHp = MAX_HP): number {
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, hp / maxHp));
}

export function styleForCombatRelation(relation: CombatRelation): CombatIdentityStyle {
  return RELATION_STYLES[relation];
}

export function makeCombatNameplateTexture(options: CombatNameplateTextureOptions): THREE.CanvasTexture {
  const style = styleForCombatRelation(options.relation);
  const healthRatio = clampHealthRatio(options.hp);
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 96;
  const context = canvas.getContext('2d')!;
  context.clearRect(0, 0, canvas.width, canvas.height);

  drawRoundedRect(context, 12, 10, 296, 72, 8);
  const panelGradient = context.createLinearGradient(12, 10, 308, 82);
  panelGradient.addColorStop(0, 'rgba(8,7,6,0.78)');
  panelGradient.addColorStop(0.58, 'rgba(21,18,15,0.72)');
  panelGradient.addColorStop(1, 'rgba(8,7,6,0.54)');
  context.fillStyle = panelGradient;
  context.fill();

  context.strokeStyle = 'rgba(247,231,198,0.26)';
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = style.accentHex;
  drawRoundedRect(context, 12, 10, 5, 72, 3);
  context.fill();

  context.shadowColor = hexToRgba(style.accentHex, 0.54);
  context.shadowBlur = 14;
  context.strokeStyle = hexToRgba(style.accentHex, 0.67);
  context.lineWidth = 1.5;
  drawRoundedRect(context, 13, 11, 294, 70, 8);
  context.stroke();
  context.shadowBlur = 0;

  context.fillStyle = 'rgba(247,231,198,0.95)';
  context.font = 'bold 24px Trebuchet MS, Segoe UI, sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText(options.name.slice(0, 18), 32, 34, 178);

  drawBadge(context, style.badge, style.accentHex);
  drawHealthBar(context, healthRatio, style);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function drawBadge(context: CanvasRenderingContext2D, label: string, accentHex: string): void {
  context.save();
  drawRoundedRect(context, 226, 21, 62, 22, 5);
  context.fillStyle = hexToRgba(accentHex, 0.18);
  context.fill();
  context.strokeStyle = hexToRgba(accentHex, 0.72);
  context.lineWidth = 1;
  context.stroke();
  context.fillStyle = '#f7e7c6';
  context.font = 'bold 11px Trebuchet MS, Segoe UI, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, 257, 32);
  context.restore();
}

function drawHealthBar(
  context: CanvasRenderingContext2D,
  healthRatio: number,
  style: CombatIdentityStyle
): void {
  context.save();
  drawRoundedRect(context, 32, 58, 256, 12, 5);
  context.fillStyle = 'rgba(0,0,0,0.48)';
  context.fill();
  context.strokeStyle = 'rgba(247,231,198,0.22)';
  context.lineWidth = 1;
  context.stroke();

  const fillWidth = Math.max(0, 256 * healthRatio);
  if (fillWidth > 0) {
    context.beginPath();
    drawRoundedRect(context, 33, 59, Math.max(4, fillWidth - 2), 10, 4);
    const fillGradient = context.createLinearGradient(33, 59, 288, 59);
    fillGradient.addColorStop(0, style.healthStart);
    fillGradient.addColorStop(1, style.healthEnd);
    context.fillStyle = fillGradient;
    context.fill();
  }

  context.fillStyle = 'rgba(247,231,198,0.74)';
  context.font = 'bold 9px Trebuchet MS, Segoe UI, sans-serif';
  context.textAlign = 'right';
  context.textBaseline = 'middle';
  context.fillText(`${Math.round(healthRatio * 100)}%`, 286, 64);
  context.restore();
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const resolvedRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + resolvedRadius, y);
  context.lineTo(x + width - resolvedRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + resolvedRadius);
  context.lineTo(x + width, y + height - resolvedRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - resolvedRadius, y + height);
  context.lineTo(x + resolvedRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - resolvedRadius);
  context.lineTo(x, y + resolvedRadius);
  context.quadraticCurveTo(x, y, x + resolvedRadius, y);
  context.closePath();
}

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const number = Number.parseInt(value, 16);
  const r = (number >> 16) & 255;
  const g = (number >> 8) & 255;
  const b = number & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
