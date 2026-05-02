import { afterEach, describe, expect, it, vi } from 'vitest';
import { findPublishedMapChoice, loadPublishedMapChoices } from './PublishedMaps';

describe('PublishedMaps', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('exposes Grand Ornate Marble Hallway to map roulette and custom selection', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        defaultPresetId: 'grand-ornate-marble-hallway',
        maps: [
          {
            presetId: 'grand-ornate-marble-hallway',
            calibrationGroupId: 'grand-ornate-marble-hallway',
            displayName: 'Grand Ornate Marble Hallway',
            presetUrl: '/arena-presets/grand-ornate-marble-hallway-high.json',
            splatUrl: '/splats/grand-ornate-marble-hallway-high.sog',
            enabledModes: [],
            defaultQuality: 'high',
            qualities: {
              high: {
                presetId: 'grand-ornate-marble-hallway-high',
                presetUrl: '/arena-presets/grand-ornate-marble-hallway-high.json',
                splatUrl: '/splats/grand-ornate-marble-hallway-high.sog'
              }
            }
          },
          {
            presetId: 'grand-ornate-marble-hallway-high',
            displayName: 'Grand Ornate Marble Hallway (HIGH)',
            presetUrl: '/arena-presets/grand-ornate-marble-hallway-high.json',
            splatUrl: '/splats/grand-ornate-marble-hallway-high.sog',
            enabledModes: ['1v1', '2v2']
          }
        ]
      })
    } as Response));

    const maps = await loadPublishedMapChoices();
    const selected = findPublishedMapChoice(maps, 'grand-ornate-marble-hallway-high');

    expect(selected).toMatchObject({
      presetId: 'grand-ornate-marble-hallway',
      displayName: 'Grand Ornate Marble Hallway',
      previewUrl: '/map-previews/grand-ornate-marble-hallway.png',
      enabledModes: ['1v1', '2v2'],
      presetUrl: '/arena-presets/grand-ornate-marble-hallway-high.json'
    });
  });
});
