# Lobby Music And Audio Settings

## Goal
Make lobby music audible by correcting the leftover ambient/noise mix and persist sound configuration changes.

## Implementation Notes
- Root cause to verify: `GameApp.openQualityModal()` currently opens `QualitySettingsModal` without passing `AudioManager.getSettings()` or an `onAudioSettingsChange` callback, so slider changes do not reach persistent audio storage.
- Root cause to verify: lobby music starts together with `ambience.lobby`; the ambience layer and default ambience channel are high enough to mask the lobby track.
- Keep lobby music playing through `AudioManager.playMusic('music.lobby')`, but lower the masking ambience mix and make the music channel the perceptual lead.
- Ensure volume/mute settings write to persistent storage when changed and are loaded on startup.

## Verification
- Add or update client audio settings tests for persistence.
- Add or update catalog tests for the lobby music/ambience mix balance.
- Run client tests and build.
