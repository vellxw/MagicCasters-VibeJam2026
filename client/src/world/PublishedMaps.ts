import type { MatchMode } from '../../../shared/types';
import {
  compactSplatMapCatalog,
  isPlayableSplatMapEntry,
  type SplatMapPoolEntry
} from '../../../shared/splatMapPool';
import { loadSplatMapCatalog } from './ArenaPreset';

export interface PublishedMapChoice {
  presetId: string;
  displayName: string;
  previewUrl: string;
  enabledModes: MatchMode[];
  presetUrl: string;
}

const PREVIEW_BY_GROUP: Record<string, { title: string; url: string }> = {
  'celestial-marble-crystal-palace': {
    title: "The Celestial Guardian's Plaza",
    url: '/map-previews/the-celestial-guardians-plaza.png'
  },
  'grand-medieval-castle-courtyard': {
    title: 'Grand Medieval Castle Courtyard',
    url: '/map-previews/grand-medieval-castle-courtyard.png'
  },
  'ruined-palace-of-purple-crystals': {
    title: 'Ruined Palace of Purple Crystals',
    url: '/map-previews/ruined-palace-of-purple-crystals.png'
  },
  'the-arcane-ritual-library': {
    title: 'The Arcane Ritual Library',
    url: '/map-previews/the-arcane-ritual-library.png'
  },
  'the-dragon-gate-bridge': {
    title: 'The Dragon Gate Bridge',
    url: '/map-previews/the-dragon-gate-bridge.png'
  }
};

export async function loadPublishedMapChoices(): Promise<PublishedMapChoice[]> {
  const catalog = await loadSplatMapCatalog();
  return compactSplatMapCatalog(catalog, {
    includeUnassigned: true
  })
    .filter(isPlayableSplatMapEntry)
    .map((entry) => choiceFromEntry(entry))
    .filter((entry): entry is PublishedMapChoice => Boolean(entry));
}

export function findPublishedMapChoice(
  maps: PublishedMapChoice[],
  presetId: string,
  fallbackName = ''
): PublishedMapChoice | null {
  const direct = maps.find((entry) => entry.presetId === presetId);
  if (direct) return direct;
  const normalized = stripQualitySuffix(presetId);
  return maps.find((entry) => entry.presetId === normalized)
    ?? maps.find((entry) => entry.displayName === fallbackName)
    ?? null;
}

function choiceFromEntry(entry: SplatMapPoolEntry): PublishedMapChoice | null {
  const groupId = entry.calibrationGroupId?.trim() || stripQualitySuffix(entry.presetId);
  const preview = PREVIEW_BY_GROUP[groupId];
  if (!preview) return null;
  const modes: MatchMode[] = entry.enabledModes?.length
    ? [...entry.enabledModes]
    : ['1v1', '2v2'];
  return {
    presetId: groupId,
    displayName: preview.title,
    previewUrl: preview.url,
    enabledModes: modes,
    presetUrl: entry.presetUrl
  };
}

function stripQualitySuffix(value: string): string {
  return value.replace(/-(low|mid|high)$/i, '');
}
