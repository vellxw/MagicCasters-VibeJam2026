# Celestial Marble Manual Collision Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Celestial Marble Crystal Palace load reliably in every enabled game mode after removing automatic collision assets, while keeping the manually placed collision setup and making ramp colliders solid underneath.

**Architecture:** Celestial Marble should rely on JSON preset bounds, spawn points, manual `collisionWalls`, and `floorY`; it should not reference deleted generated collision files. Ramp physics lives in `shared/arenaCollision.ts`, which is used by both client and server movement, so the ramp fix must be shared and covered by server tests.

**Tech Stack:** Vite, TypeScript, Three.js client, Node/Colyseus server, shared movement collision utilities, Vitest.

---

### Task 1: Remove Dead Auto-Collision References

**Files:**
- Modify: `client/public/arena-presets/celestial-marble-crystal-palace-high.json`
- Modify: `client/public/arena-presets/celestial-marble-crystal-palace-mid.json`
- Modify: `client/public/arena-presets/celestial-marble-crystal-palace-low.json`
- Test: `client/src/world/ArenaPreset.test.ts`

- [x] **Step 1: Confirm failure source**

Run:

```bash
git status --short
```

Expected evidence: deleted `client/public/collision/celestial-marble-crystal-palace.*` files and modified Celestial Marble preset JSON files still containing `collisionMeshUrl` / `voxelCollisionUrl` paths.

- [x] **Step 2: Update presets**

Set these two fields to `null` in all three Celestial Marble quality presets:

```json
"collisionMeshUrl": null,
"voxelCollisionUrl": null
```

Keep the current manual `collisionWalls`, `collisionErasers`, `bounds`, `floorY`, `spawnPoints`, and `spawnPointsByMode` exactly as the working calibration source.

- [x] **Step 3: Add preset coverage**

Add a client-side test that normalizes a Celestial Marble-style preset with `null` collision asset URLs and asserts:

```ts
expect(preset.collisionMeshUrl).toBeNull();
expect(preset.voxelCollisionUrl).toBeNull();
expect(preset.enabledModes).toEqual(['1v1', '2v2']);
expect(preset.spawnPointsByMode['2v2']).toHaveLength(4);
expect(preset.collisionWalls.some((wall) => wall.ramp)).toBe(true);
```

- [x] **Step 4: Verify target test**

Run:

```bash
npm run test --workspace client -- ArenaPreset
```

Expected: PASS.

### Task 2: Make Manual Ramps Solid Underneath

**Files:**
- Modify: `shared/arenaCollision.ts`
- Modify: `server/src/systems/ArenaRampCollision.test.ts`

- [x] **Step 1: Update ramp tests**

Replace the old expectation that ramps never block horizontal movement with coverage for two behaviors:

```ts
const blocked = moveWithArenaCollision(0, -3.4, 0, 0.25, bounds, [ramp], {
  playerY: 0,
  floorY: 0
});
expect(blocked.z).toBeLessThan(0);

const onSurface = moveWithArenaCollision(0, -3.4, 0, 0.25, bounds, [ramp], {
  playerY: 0.82,
  floorY: 0
});
expect(onSurface.z).toBeCloseTo(0.25, 5);
```

This captures the desired rule: a ramp is solid under its inclined surface, but a player standing on the ramp surface can continue moving along it.

- [x] **Step 2: Implement shared ramp blocking**

In `shared/arenaCollision.ts`, make `moveThroughCollisionWalls` evaluate ramp blockers per movement step. A ramp should block when the player capsule is inside the ramp footprint and `playerY + obstacleClearance` is below the ramp surface at that target position. Non-ramp walls keep the existing vertical-wall behavior.

- [x] **Step 3: Verify target server test**

Run:

```bash
npm run test --workspace server -- ArenaRampCollision
```

Expected: PASS.

### Task 3: End-to-End Verification and Shipping

**Files:**
- Modify as needed only if tests reveal a real regression.

- [x] **Step 1: Run the reliable repo checks**

Run:

```bash
npm run typecheck
npm run test --workspace server
npm run build
```

Expected: all PASS.

- [ ] **Step 2: Commit on main**

Run:

```bash
git status --short
git add docs/superpowers/plans/2026-05-01-celestial-marble-manual-collision.md client/public/arena-presets/celestial-marble-crystal-palace-high.json client/public/arena-presets/celestial-marble-crystal-palace-mid.json client/public/arena-presets/celestial-marble-crystal-palace-low.json client/src/world/ArenaPreset.test.ts shared/arenaCollision.ts server/src/systems/ArenaRampCollision.test.ts server/src/http/localEnv.ts server/src/http/localEnv.test.ts
git commit -m "fix: restore celestial marble manual collisions"
```

Expected: commit succeeds on `main`.

- [ ] **Step 3: Push and loop on failure**

Run:

```bash
git push origin main
```

If any verification or push step fails, read the error, fix the root cause, and repeat the relevant verification before retrying the push.

## Execution Notes

- Root cause confirmed: Celestial Marble presets still referenced deleted generated collision assets.
- Presets now rely on manual `collisionWalls` with `collisionMeshUrl` and `voxelCollisionUrl` set to `null`.
- Ramp collision now blocks traversal below the inclined surface while allowing movement along the ramp surface.
- Targeted checks passed: `npm run test --workspace client -- ArenaPreset` and `npm run test --workspace server -- ArenaRampCollision`.
- Full checks passed locally: `npm run typecheck`, `npm run test --workspace server`, and `npm run build`.
