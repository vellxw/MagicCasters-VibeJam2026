# Audio Keybinds Deploy Checklist

## Goal
Ship the lobby audio, persisted settings, quieter combat effects, and keybinding configurator to production.

## Implementation Notes
- Run the focused failing tests before production edits.
- Implement the smallest changes that satisfy those tests.
- Run the broader verification set used for this repo: client targeted tests, server tests, `npm run typecheck`, and `npm run build`.
- Smoke test the local production server in a browser before pushing.
- Push to `origin/main`, then verify the production site at `https://playmagiccasters.com`.

## Verification
- Confirm `origin/main` includes the shipped commit.
- Confirm production responds on `https://playmagiccasters.com`.
- Browser-check that the lobby loads, Settings opens, audio controls persist, and combat keybinding controls are visible.
