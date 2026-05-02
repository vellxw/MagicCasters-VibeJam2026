import { isSpellId } from '../../../shared/spells';
import { spellAudioId, type AudioId } from './AudioCatalog';

export interface AudioPosition {
  x: number;
  y: number;
  z: number;
}

export interface AudioCue {
  id: AudioId;
  position?: AudioPosition;
  mode?: 'play' | 'music' | 'ambience';
  force?: boolean;
}

export interface AudioRouteContext {
  localSessionId?: string | null;
  arenaPresetId?: string | null;
}

export function audioCuesForNetEvent(
  type: string,
  payload: Record<string, unknown> = {},
  context: AudioRouteContext = {}
): AudioCue[] {
  if (type === 'phase') {
    return typeof payload.phase === 'string' ? audioCuesForPhase(payload.phase, context) : [];
  }

  if (type === 'spell_confirmed' && typeof payload.spellId === 'string' && isSpellId(payload.spellId)) {
    return [{ id: spellAudioId(payload.spellId, 'cast'), position: positionFromPayload(payload) }];
  }

  if (type === 'projectile_impact' && typeof payload.spellId === 'string' && isSpellId(payload.spellId)) {
    return [{ id: spellAudioId(payload.spellId, 'impact'), position: positionFromPayload(payload) }];
  }

  if (type === 'cast_denied') {
    return [{ id: 'ui.denied' }];
  }

  if (type === 'potion_collected') {
    return [{ id: 'ui.confirm', position: positionFromPayload(payload) }];
  }

  if (type === 'damage') {
    const cues: AudioCue[] = [];
    if (!context.localSessionId || payload.targetId === context.localSessionId) {
      cues.push({ id: 'combat.damage_taken' });
    }
    if (typeof payload.hp === 'number' && payload.hp <= 0) {
      cues.push({ id: 'combat.final_blow' }, { id: 'announcer.final_blow' });
    }
    return cues;
  }

  if (type === 'trap_placed') {
    return [{ id: 'spell.void_trap.cast', position: positionFromPayload(payload) }];
  }

  if (type === 'trap_triggered') {
    return [{ id: 'spell.void_trap.impact', position: positionFromPayload(payload) }];
  }

  if (type === 'mark_applied') {
    const cues: AudioCue[] = [{ id: 'status.mark_applied', position: positionFromPayload(payload) }];
    if (payload.targetId !== context.localSessionId) {
      cues.push({ id: 'announcer.enemy_marked' });
    }
    return cues;
  }

  if (type === 'mark_consumed') {
    return [{ id: 'status.mark_consumed', position: positionFromPayload(payload) }];
  }

  if (type === 'ground_line_hit') {
    return [{ id: 'spell.glacial_spikes.impact', position: positionFromPayload(payload) }];
  }

  if (type === 'glacial_spike_telegraph') {
    return [{ id: 'spell.glacial_spikes.cast' }];
  }

  if (type === 'glacial_spike_erupted') {
    return [{ id: 'spell.glacial_spikes.impact' }];
  }

  if (type === 'shield_exploded') {
    return [
      { id: 'spell.firmament_shield.impact', position: positionFromPayload(payload) },
      { id: 'announcer.shield_broken' }
    ];
  }

  return [];
}

export function audioCuesForPhase(phase: string, context?: AudioRouteContext): AudioCue[] {
  if (phase === 'SELECTING') {
    return [{ id: 'ui.confirm' }];
  }
  if (phase === 'COUNTDOWN') {
    return [{ id: 'ui.countdown' }];
  }
  if (phase === 'PLAYING') {
    return [
      { id: 'announcer.duel_begins' },
      { id: resolveMatchMusic(context?.arenaPresetId), mode: 'music' },
      { id: 'ambience.match', mode: 'ambience' }
    ];
  }
  return [];
}

function resolveMatchMusic(presetId: string | null | undefined): AudioId {
  if (!presetId) return 'music.match';
  const groupId = presetId.replace(/-(low|mid|high)$/i, '');
  const arcaneGroups = [
    'grand-medieval-castle-courtyard',
    'celestial-marble-crystal-palace',
    'the-dragon-gate-bridge'
  ];
  const aetherGroups = [
    'ruined-palace-of-purple-crystals',
    'the-arcane-ritual-library',
    'grand-ornate-marble-hallway'
  ];
  if (arcaneGroups.includes(groupId)) return 'music.match.arcane';
  if (aetherGroups.includes(groupId)) return 'music.match.aether';
  return 'music.match';
}

export function audioCuesForMatchResult(args: {
  winnerId: string;
  localSessionId: string | null;
  winnerTeamId?: string;
  localTeamId?: string;
}): AudioCue[] {
  if (args.winnerTeamId && args.localTeamId) {
    return [{ id: args.winnerTeamId === args.localTeamId ? 'announcer.victory' : 'announcer.defeat' }];
  }
  if (!args.localSessionId || !args.winnerId) return [];
  return [{ id: args.winnerId === args.localSessionId ? 'announcer.victory' : 'announcer.defeat' }];
}

function positionFromPayload(payload: Record<string, unknown>): AudioPosition {
  return {
    x: finiteNumber(payload.x, 0),
    y: finiteNumber(payload.y, 0),
    z: finiteNumber(payload.z, 0)
  };
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
