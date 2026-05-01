# Combat SFX Defaults

## Goal
Make combat effects a little quieter by default without muting feedback-critical UI, voice, or music.

## Implementation Notes
- Lower the default `sfx` channel volume from the current aggressive mix to a more restrained default.
- Lower spell cast and impact catalog volumes slightly so stacked combat sounds do not overpower music or voice.
- Keep UI and announcer voice clear enough for match flow.

## Verification
- Add or update audio settings and catalog tests to lock the new default SFX balance.
- Run client audio tests and full verification before deploy.
