# Phase 3: Characters And Selector

Goal: add character models and class selection without reintroducing the old match-load freeze.

## Inputs From Old Repo

- `client/public/models/**`
- `client/src/player/AnimatedPlayerController.ts`
- `client/src/ui/CharacterSelectOverlay.ts`
- relevant `.character-select` styles from old `client/src/style.css`
- `shared/classes.ts`
- class spell variants from old `shared/spells.ts` where compatible

## Integration Strategy

- Keep current `client/src/game/GameApp.ts` as the base.
- Do not copy old `GameApp.ts` wholesale.
- Insert selector flow before queueing:
  - lobby portal
  - character selector
  - queue
  - match
- Send `characterClass` through `NetworkClient.connect`.
- Store `characterClass` in server `PlayerState`.
- If GLB model loading fails, fall back to the current simple capsule player.

## Steps

- [x] Copy character model assets.
- [x] Add `shared/classes.ts`.
- [x] Copy/adapt `AnimatedPlayerController.ts`.
- [x] Copy/adapt `CharacterSelectOverlay.ts`.
- [x] Merge selector styles.
- [x] Update `NetworkClient.connect` to pass `characterClass`.
- [x] Update server join options and `PlayerState`.
- [x] Update local/remote player controller creation to use animated controller with fallback.
- [x] Verify the selected map still mounts after queue succeeds via build/typecheck coverage.

## Implementation Notes

- Lobby portals now open `CHARACTER_SELECT` instead of queueing immediately.
- Confirming the selector calls `enterQueue` with the selected `CharacterClass`.
- Character GLBs preload in the background and are cached; match entry never waits on GLB loading.
- If a GLB is unavailable, player creation falls back to the existing capsule controller.
- Preview rendering uses cloned GLB resources so preview/controller disposal does not dispose cached model resources.
- `client` now has a Vitest script; `NetworkClient.test.ts` verifies the join payload includes `characterClass`.

## Verification

- `npm run test --workspace client`
- `npm run test --workspace server`
- `npm run splat:qualities`
- `npm run typecheck`
- `npm run build`

## Known Risk

The old selector froze after entering a match because map/server/preset flow was fragile. The fix is to preserve this repo's current arena loading and only insert selector before queue.

Remaining manual QA: run two browsers, choose different classes, and confirm both clients show the selected models on the server-selected map.
