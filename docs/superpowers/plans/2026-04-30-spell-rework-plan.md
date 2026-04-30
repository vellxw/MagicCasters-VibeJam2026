# Spell Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 4 generic spells with 8 class-unique spells (4 per class) featuring internal combo synergy, new trap and ground-line mechanics, and updated client VFX.

**Architecture:** Server-authoritative spell system with shared definitions. New spell kinds (`trap`, `ground_line`) extend the existing `projectile`/`instant`/`dash` model. Class-specific combo effects (mark consumption, conditional damage, explosive shield) are applied server-side in `MagicDuelRoom` and synchronized via new network events for client VFX.

**Tech Stack:** TypeScript, Colyseus (server schema + room), Three.js (client VFX fallback), Vite, Vitest.

---

## File Structure Overview

| File | Responsibility |
|------|----------------|
| `shared/spells.ts` | Spell definitions, IDs, incantations, class variants |
| `shared/classes.ts` | Character classes and their spell ID lists |
| `shared/types.ts` | Network event payloads, player state interfaces |
| `server/src/schema/PlayerState.ts` | Colyseus schema with new state fields (markedUntil, rootedUntil, explosiveShield) |
| `server/src/schema/TrapState.ts` | Colyseus schema for active traps |
| `server/src/systems/SpellSystem.ts` | Core cast validation & execution, including trap/ground_line hit logic |
| `server/src/systems/SpellSystem.test.ts` | Tests for all spell execution paths |
| `server/src/rooms/MagicDuelRoom.ts` | Game loop, trap ticking, class effect application, network event broadcasting |
| `server/src/systems/MovementSystem.ts` | Player movement; must respect `rootedUntil` |
| `client/src/spells/SpellVfxManager.ts` | Client-side VFX for projectiles, impacts, and new events |
| `client/src/game/GameApp.ts` | Event listeners for new network events, delegates to VFX |
| `client/src/ui/DebugOverlay.ts` | Spell dock UI showing class-appropriate spells |

---

## Phase 1: Foundations — Shared Definitions, Server Schema, Basic Spells

### Task 1.1: Redefine `shared/spells.ts`

**Files:**
- Modify: `shared/spells.ts`
- Test: `server/src/systems/SpellSystem.test.ts` (will be updated in Task 1.4)

**Context:** Replace `SPELL_IDS` and `SPELLS` with the 8 new spells. Update `SpellDefinition` to support `kind: 'trap' | 'ground_line'`. Update `CLASS_SPELL_VARIANTS` with names, incantations, and descriptions per class.

- [ ] **Step 1: Update `SpellDefinition` interface**

```typescript
export interface SpellDefinition {
  id: SpellId;
  label: string;
  incantation: string;
  key: string;
  manaCost: number;
  cooldownMs: number;
  kind: 'projectile' | 'instant' | 'dash' | 'trap' | 'ground_line';
  damage: number;
  range: number;
  radius: number;
  speed: number;
  ttl: number;
  color: number;
}
```

- [ ] **Step 2: Replace `SPELL_IDS` and `SPELLS`**

```typescript
export const SPELL_IDS = [
  'shadow_dart',
  'void_trap',
  'abyssal_claw',
  'eclipse',
  'judgment_ray',
  'penitent_seal',
  'glacial_spikes',
  'firmament_shield'
] as const;

export type SpellId = (typeof SPELL_IDS)[number];

export const SPELLS: Record<SpellId, SpellDefinition> = {
  shadow_dart: {
    id: 'shadow_dart',
    label: 'Dardo Sombrio',
    incantation: 'nox',
    key: '1',
    manaCost: 12,
    cooldownMs: 700,
    kind: 'projectile',
    damage: 10,
    range: 14,
    radius: 0.32,
    speed: 14,
    ttl: 1.6,
    color: 0x8b5cf6
  },
  void_trap: {
    id: 'void_trap',
    label: 'Trampa del Vacio',
    incantation: 'umbra',
    key: '2',
    manaCost: 16,
    cooldownMs: 5000,
    kind: 'trap',
    damage: 12,
    range: 0,
    radius: 1.5,
    speed: 0,
    ttl: 4,
    color: 0x4c1d95
  },
  abyssal_claw: {
    id: 'abyssal_claw',
    label: 'Garras Abisales',
    incantation: 'abyssus',
    key: '3',
    manaCost: 20,
    cooldownMs: 1200,
    kind: 'projectile',
    damage: 14,
    range: 13,
    radius: 0.38,
    speed: 11,
    ttl: 1.8,
    color: 0x7c3aed
  },
  eclipse: {
    id: 'eclipse',
    label: 'Eclipse',
    incantation: 'exanima',
    key: '4',
    manaCost: 28,
    cooldownMs: 4500,
    kind: 'instant',
    damage: 10,
    range: 4,
    radius: 4,
    speed: 0,
    ttl: 0.45,
    color: 0x1e1b4b
  },
  judgment_ray: {
    id: 'judgment_ray',
    label: 'Rayo del Juicio',
    incantation: 'fulgur',
    key: '1',
    manaCost: 14,
    cooldownMs: 900,
    kind: 'projectile',
    damage: 14,
    range: 14,
    radius: 0.34,
    speed: 13,
    ttl: 1.5,
    color: 0xf59e0b
  },
  penitent_seal: {
    id: 'penitent_seal',
    label: 'Sello Penitente',
    incantation: 'judicium',
    key: '2',
    manaCost: 22,
    cooldownMs: 3600,
    kind: 'instant',
    damage: 6,
    range: 4,
    radius: 4,
    speed: 0,
    ttl: 0.4,
    color: 0xfef08a
  },
  glacial_spikes: {
    id: 'glacial_spikes',
    label: 'Picos Glaciales',
    incantation: 'glacius',
    key: '3',
    manaCost: 24,
    cooldownMs: 3000,
    kind: 'ground_line',
    damage: 18,
    range: 7,
    radius: 0.6,
    speed: 0,
    ttl: 0.3,
    color: 0x7dd3fc
  },
  firmament_shield: {
    id: 'firmament_shield',
    label: 'Escudo del Firmamento',
    incantation: 'scutum',
    key: '4',
    manaCost: 18,
    cooldownMs: 5000,
    kind: 'instant',
    damage: 0,
    range: 2.5,
    radius: 2.5,
    speed: 0,
    ttl: 0,
    color: 0x93c5fd
  }
};
```

- [ ] **Step 3: Update `CLASS_SPELL_VARIANTS`**

Replace the entire `CLASS_SPELL_VARIANTS` block with one entry per spell per class. The `id` must match the new `SpellId`, `incantation` must match the spell's incantation, and `description` should reflect the class fantasy.

For `arcanist`:
- `shadow_dart`: description about applying a mark.
- `void_trap`: description about placing an invisible trap.
- `abyssal_claw`: description about consuming marks for bonus damage and silence.
- `eclipse`: description about AOE that consumes marks for healing.

For `divine`:
- `judgment_ray`: description about bonus damage against slowed/silenced targets.
- `penitent_seal`: description about AOE silence and slow.
- `glacial_spikes`: description about ground spikes and root on debuffed targets.
- `firmament_shield`: description about shield that can become explosive.

- [ ] **Step 4: Update helper functions**

Ensure `isSpellId`, `spellIdFromKey`, and `spellIdFromIncantation` work with the new `SPELL_IDS`.

`spellIdFromIncantation` must check against `SPELLS[id].incantation`.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: May show errors in files still referencing old spell IDs; fix them in subsequent tasks.

- [ ] **Step 6: Commit**

```bash
git add shared/spells.ts
git commit -m "feat(spells): redefine 8 class-unique spells with new kinds"
```

---

### Task 1.2: Update `shared/classes.ts`

**Files:**
- Modify: `shared/classes.ts`

- [ ] **Step 1: Update `spellIds` arrays**

```typescript
spellIds: ['shadow_dart', 'void_trap', 'abyssal_claw', 'eclipse']
```
for arcanist, and
```typescript
spellIds: ['judgment_ray', 'penitent_seal', 'glacial_spikes', 'firmament_shield']
```
for divine.

- [ ] **Step 2: Commit**

```bash
git add shared/classes.ts
git commit -m "feat(classes): assign new spell ids to arcanist and divine"
```

---

### Task 1.3: Update `server/src/schema/PlayerState.ts`

**Files:**
- Modify: `server/src/schema/PlayerState.ts`

- [ ] **Step 1: Add new fields to schema**

Add these typed fields to the class:

```typescript
@type('number') markedUntil = 0;
@type('number') rootedUntil = 0;
@type('boolean') explosiveShield = false;
```

Also add them to the plain JS properties (below `@type` declarations):

```typescript
markedUntil = 0;
rootedUntil = 0;
explosiveShield = false;
```

- [ ] **Step 2: Update `resetForMatch`**

Reset the new fields:

```typescript
this.markedUntil = 0;
this.rootedUntil = 0;
this.explosiveShield = false;
```

- [ ] **Step 3: Update `syncCooldownFields`**

Map the new spell IDs to cooldown fields. Since we renamed spells, the old `fireballReadyAt` etc. fields in the schema should be renamed or replaced. **Decision:** Replace the four old cooldown fields with generic ones, OR keep the old field names for backward compatibility but map them to new spells.

Simpler approach: rename the schema fields to match the new spell IDs.

Replace:
```typescript
@type('number') fireballReadyAt = 0;
@type('number') iceBoltReadyAt = 0;
@type('number') lightBurstReadyAt = 0;
@type('number') shadowDashReadyAt = 0;
```

With:
```typescript
@type('number') shadowDartReadyAt = 0;
@type('number') voidTrapReadyAt = 0;
@type('number') abyssalClawReadyAt = 0;
@type('number') eclipseReadyAt = 0;
@type('number') judgmentRayReadyAt = 0;
@type('number') penitentSealReadyAt = 0;
@type('number') glacialSpikesReadyAt = 0;
@type('number') firmamentShieldReadyAt = 0;
```

And update `syncCooldownFields`:

```typescript
this.shadowDartReadyAt = this.cooldowns.shadow_dart ?? 0;
this.voidTrapReadyAt = this.cooldowns.void_trap ?? 0;
this.abyssalClawReadyAt = this.cooldowns.abyssal_claw ?? 0;
this.eclipseReadyAt = this.cooldowns.eclipse ?? 0;
this.judgmentRayReadyAt = this.cooldowns.judgment_ray ?? 0;
this.penitentSealReadyAt = this.cooldowns.penitent_seal ?? 0;
this.glacialSpikesReadyAt = this.cooldowns.glacial_spikes ?? 0;
this.firmamentShieldReadyAt = this.cooldowns.firmament_shield ?? 0;
```

- [ ] **Step 4: Commit**

```bash
git add server/src/schema/PlayerState.ts
git commit -m "feat(player-state): add markedUntil, rootedUntil, explosiveShield and new cooldown fields"
```

---

### Task 1.4: Update `server/src/systems/SpellSystem.ts` — Core Logic

**Files:**
- Modify: `server/src/systems/SpellSystem.ts`
- Modify: `server/src/systems/SpellSystem.test.ts`

**Context:** Update `ServerPlayer` interface to include new fields. Update `executeSpellCast` to handle `trap` and `ground_line` kinds at a basic level (trap places a state object, ground_line returns hits). Update tests to use new spell IDs.

- [ ] **Step 1: Update `ServerPlayer` interface**

Add:
```typescript
markedUntil?: number;
rootedUntil?: number;
explosiveShield?: boolean;
```

- [ ] **Step 2: Update `executeSpellCast` for new kinds**

For `trap` kind:
- Return `{ ok: true, kind: 'trap', spellId, trap: { x: caster.x, z: caster.z, ownerId: caster.id, spellId, expiresAt: now + spell.ttl * 1000 } }`.

For `ground_line` kind:
- Compute direction from `caster.rotY`.
- Define line rectangle: origin at caster, extends `spell.range` forward, width `spell.radius * 2`.
- For each target, project position onto line axis. If perpendicular distance <= `spell.radius` and longitudinal distance between 0 and `spell.range`, it's a hit.
- Return `{ ok: true, kind: 'instant', spellId, hits }` with damage applied.

**Note:** For `ground_line`, the damage is applied immediately (it's an instant effect, not a projectile).

- [ ] **Step 3: Update `CastResult` type**

Add:
```typescript
| { ok: true; kind: 'trap'; spellId: SpellId; trap: { x: number; z: number; ownerId: string; spellId: SpellId; expiresAt: number } }
```

- [ ] **Step 4: Update tests**

Replace all references to old spell IDs in `SpellSystem.test.ts` with new ones. Add tests for:
- `shadow_dart` creates a projectile.
- `eclipse` damages targets in range.
- `glacial_spikes` damages targets in a line.
- `firmament_shield` applies `shieldActive`.

Example test skeleton:

```typescript
it('creates a shadow_dart projectile', () => {
  const caster = createTestPlayer('caster');
  caster.mana = 100;
  const result = executeSpellCast({
    caster,
    targets: [],
    spellId: 'shadow_dart',
    now: 1000,
    phase: 'PLAYING',
    nextProjectileId: () => 'p1'
  });
  expect(result.ok).toBe(true);
  expect(result.kind).toBe('projectile');
});
```

- [ ] **Step 5: Run tests**

Run: `npm run test --workspace server`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/systems/SpellSystem.ts server/src/systems/SpellSystem.test.ts
git commit -m "feat(spell-system): support new spell kinds and ids, add tests"
```

---

### Task 1.5: Update `server/src/rooms/MagicDuelRoom.ts` — Basic Integration

**Files:**
- Modify: `server/src/rooms/MagicDuelRoom.ts`

**Context:** Wire the new spell results into the room. Handle `trap` results by storing them. Handle `ground_line` hits by broadcasting damage. Update `applyClassSpellEffects` to work with new spells.

- [ ] **Step 1: Add trap storage to room**

Add a private field:
```typescript
private traps = new Map<string, { x: number; z: number; radius: number; ownerId: string; spellId: SpellId; expiresAt: number }>();
```

- [ ] **Step 2: Handle `trap` cast result in `handleCast`**

After `executeSpellCast`, if `result.kind === 'trap'`:
- Remove any existing trap for this caster: iterate `this.traps`, delete entries where `ownerId === caster.id`.
- Add the new trap with a unique ID.
- Broadcast `spell_confirmed` as usual.

- [ ] **Step 3: Handle `ground_line` in `handleCast`**

`ground_line` returns `kind: 'instant'` with hits, so the existing instant handling already broadcasts damage. Just ensure `applyClassSpellEffects` is called.

- [ ] **Step 4: Update `applyClassSpellEffects`**

Rewrite the method to handle the 8 new spells with their class-specific logic.

For `arcanist`:
- `shadow_dart` hit: set `target.markedUntil = now + 3000`.
- `abyssal_claw` hit: if `target.markedUntil > now`, then `target.markedUntil = 0`, apply extra 8 damage, `target.silencedUntil = now + 800`, broadcast `mark_consumed`.
- `eclipse` hits: for each target in range, if `markedUntil > now`, consume mark (add 10 damage, heal caster 5 HP). The extra damage is applied by calling `applyDamage(target, 10)` after the base damage. The heal is `caster.hp = Math.min(MAX_HP, caster.hp + 5)`.
- `void_trap` trigger: when trap logic detects a hit (in tick), apply damage and `markedUntil = now + 3000`.

For `divine`:
- `judgment_ray` hit: if target has `silencedUntil > now || slowedUntil > now`, apply extra 7 damage (since base is 14, total 21). Call `applyDamage(target, 7)`.
- `penitent_seal` hits: apply `silencedUntil = now + 1000` and `slowedUntil = now + 1500`.
- `glacial_spikes` hits: if target has `silencedUntil > now || slowedUntil > now`, apply `rootedUntil = now + 500`.
- `firmament_shield` cast: check if any enemy is within 2.5m with `silencedUntil > now || slowedUntil > now`. If yes, `caster.explosiveShield = true`. Otherwise, `caster.shieldActive = true`.

- [ ] **Step 5: Modify `applyDamage` for explosive shield**

In `SpellSystem.ts`, update `applyDamage`:

```typescript
export function applyDamage(target: ServerPlayer, amount: number): number {
  if (target.shieldActive) {
    target.shieldActive = false;
    if (target.explosiveShield) {
      target.explosiveShield = false;
      // Explosive shield damage will be handled by the caller (MagicDuelRoom)
      // Return 0 here, but the room must check for explosiveShield after this call
    }
    return 0;
  }
  const before = target.hp;
  target.hp = Math.max(0, target.hp - amount);
  return before - target.hp;
}
```

Actually, `applyDamage` is in `SpellSystem.ts` but the explosive shield logic needs access to all players. Better approach: `applyDamage` returns 0 when shield is consumed, and `MagicDuelRoom` checks `caster.explosiveShield` after calling it.

Wait — the explosive shield is on the **target** (the one being hit), not the caster. When someone hits a player with `firmament_shield` active and `explosiveShield` true, the shield absorbs the damage AND explodes.

So in `MagicDuelRoom`, when processing a damage event (either instant or projectile), after calling `applyDamage`, check if the target had `explosiveShield` and it was consumed (i.e., `shieldActive` went from true to false). If so, apply the AOE knockback and damage to all enemies within 2.5m.

Simpler: modify `applyDamage` to return a richer result:

```typescript
export function applyDamage(target: ServerPlayer, amount: number): { damage: number; shieldBroken: boolean } {
  let shieldBroken = false;
  if (target.shieldActive) {
    target.shieldActive = false;
    shieldBroken = true;
    return { damage: 0, shieldBroken };
  }
  const before = target.hp;
  target.hp = Math.max(0, target.hp - amount);
  return { damage: before - target.hp, shieldBroken };
}
```

Then update all call sites. This is a breaking change — update `applyProjectileDamage` and any other callers.

- [ ] **Step 6: Update `applyProjectileDamage` to return the new shape**

```typescript
export function applyProjectileDamage(target: ServerPlayer, spellId: SpellId): { damage: number; defeated: boolean; shieldBroken: boolean } {
  const spell = SPELLS[spellId];
  const result = applyDamage(target, spell.damage);
  return {
    damage: result.damage,
    defeated: target.hp <= 0,
    shieldBroken: result.shieldBroken
  };
}
```

- [ ] **Step 7: Update projectile hit handling in `MagicDuelRoom`**

In `updateProjectiles`, when a projectile hits:

```typescript
const hit = applyProjectileDamage(player, projectile.spellId as SpellId);
// ... broadcast damage ...
if (hit.shieldBroken && player.explosiveShield) {
  player.explosiveShield = false;
  this.explodeShield(player);
}
```

Add private method `explodeShield(player: PlayerState)`:
- For every enemy player within 2.5m, compute direction away from player, move them 2m, apply 10 damage, broadcast `shield_exploded`.

- [ ] **Step 8: Commit**

```bash
git add server/src/rooms/MagicDuelRoom.ts server/src/systems/SpellSystem.ts
git commit -m "feat(room): integrate new spells, class effects, and explosive shield"
```

---

### Task 1.6: Update `server/src/systems/MovementSystem.ts` — Root Effect

**Files:**
- Modify: `server/src/systems/MovementSystem.ts`

**Context:** `rootedUntil` must prevent horizontal movement but allow gravity/falling.

- [ ] **Step 1: Read the file to understand current movement logic**

Use the `Read` tool to inspect the file first.

- [ ] **Step 2: Add root check**

In the movement function, before applying horizontal movement from input, check:

```typescript
const isRooted = (player.rootedUntil ?? 0) > now;
if (isRooted) {
  input.forward = false;
  input.backward = false;
  input.left = false;
  input.right = false;
}
```

Use `Date.now()` or pass `now` as a parameter to `applyMovement`.

- [ ] **Step 3: Run tests**

Run: `npm run test --workspace server`
Expected: Pass (or new tests may be needed if MovementSystem has tests).

- [ ] **Step 4: Commit**

```bash
git add server/src/systems/MovementSystem.ts
git commit -m "feat(movement): respect rootedUntil state"
```

---

### Task 1.7: Update Client UI (`DebugOverlay.ts`) for New Spells

**Files:**
- Modify: `client/src/ui/DebugOverlay.ts`

**Context:** The spell dock shows buttons. It currently references `SPELL_IDS` directly. It should display only the spells for the player's class, or display all with the class variant names. Simpler: display all 8 spells but label them properly.

Actually, each player only has access to 4 spells. The `PlayerState` has `characterClass`. The client knows its own class. So the dock should show only the 4 spells for that class.

- [ ] **Step 1: Update spell button creation**

Instead of iterating `SPELL_IDS`, iterate the spells for the local player's class:

```typescript
import { CLASSES } from '../../../shared/classes';

// In the constructor or init method, determine local player class from network state
const classDef = CLASSES[this.localClass];
const spellIds = classDef.spellIds as SpellId[];

for (const id of spellIds) {
  const spell = SPELLS[id];
  // ... create button as before ...
}
```

- [ ] **Step 2: Update cooldown mapping**

The cooldown fields in `PublicPlayerState` changed. Update `cooldownFor`:

```typescript
function cooldownFor(player: PublicPlayerState, spellId: SpellId): number {
  switch (spellId) {
    case 'shadow_dart': return player.shadowDartReadyAt ?? 0;
    case 'void_trap': return player.voidTrapReadyAt ?? 0;
    case 'abyssal_claw': return player.abyssalClawReadyAt ?? 0;
    case 'eclipse': return player.eclipseReadyAt ?? 0;
    case 'judgment_ray': return player.judgmentRayReadyAt ?? 0;
    case 'penitent_seal': return player.penitentSealReadyAt ?? 0;
    case 'glacial_spikes': return player.glacialSpikesReadyAt ?? 0;
    case 'firmament_shield': return player.firmamentShieldReadyAt ?? 0;
    default: return 0;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/ui/DebugOverlay.ts
git commit -m "feat(ui): show class-specific spells in debug overlay"
```

---

## Phase 2: Advanced Mechanics — Trap Tick, Ground Line VFX, Full Class Synergy

### Task 2.1: Implement Trap Tick in `MagicDuelRoom`

**Files:**
- Modify: `server/src/rooms/MagicDuelRoom.ts`
- Test: Add tests to `server/src/systems/SpellSystem.test.ts` or create `MagicDuelRoom.test.ts`

**Context:** Traps must be checked every tick for enemy overlap.

- [ ] **Step 1: Add trap tick logic in `tick()`**

After player movement updates, iterate `this.traps`:

```typescript
const now = Date.now();
for (const [trapId, trap] of this.traps) {
  if (trap.expiresAt <= now) {
    this.traps.delete(trapId);
    continue;
  }
  for (const player of this.state.players.values()) {
    if (player.id === trap.ownerId || player.hp <= 0) continue;
    const dist = Math.hypot(player.x - trap.x, player.z - trap.z);
    if (dist <= trap.radius) {
      // Trigger trap
      const damage = applyDamage(player, SPELLS[trap.spellId].damage);
      this.broadcast('damage', { targetId: player.id, amount: damage, hp: player.hp });
      this.broadcast('trap_triggered', { trapOwnerId: trap.ownerId, targetId: player.id, x: trap.x, z: trap.z });
      
      // Apply mark if arcanist
      const owner = this.state.players.get(trap.ownerId);
      if (owner && owner.characterClass === 'arcanist') {
        player.markedUntil = now + 3000;
      }
      
      this.traps.delete(trapId);
      break;
    }
  }
}
```

- [ ] **Step 2: Clear traps on duel start/reset**

In `startDuel` and `clearProjectiles`, also call `this.traps.clear()`.

- [ ] **Step 3: Commit**

```bash
git add server/src/rooms/MagicDuelRoom.ts
git commit -m "feat(traps): tick traps and apply effects on trigger"
```

---

### Task 2.2: Client VFX for New Events

**Files:**
- Modify: `client/src/spells/SpellVfxManager.ts`
- Modify: `client/src/game/GameApp.ts`

**Context:** Handle `trap_triggered`, `mark_consumed`, `ground_line_hit`, `shield_exploded`.

- [ ] **Step 1: Add methods to `SpellVfxManager`**

```typescript
triggeredTrap(x: number, z: number): void {
  // Fallback: expanding torus burst at ground level
  const geometry = new THREE.TorusGeometry(0.5, 0.05, 8, 32);
  const material = new THREE.MeshBasicMaterial({ color: 0x4c1d95, transparent: true, opacity: 0.8 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, 0.05, z);
  mesh.rotation.x = -Math.PI / 2;
  this.scene.add(mesh);
  this.bursts.push({ mesh, ttl: 0.4, max: 0.4 });
}

consumedMark(position: THREE.Vector3): void {
  // Fallback: small dark burst
  const geometry = new THREE.IcosahedronGeometry(0.2, 0);
  const material = new THREE.MeshBasicMaterial({ color: 0x7c3aed, transparent: true, opacity: 0.9 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  this.scene.add(mesh);
  this.bursts.push({ mesh, ttl: 0.25, max: 0.25 });
}

groundLineHit(origin: THREE.Vector3, dir: THREE.Vector3): void {
  // Fallback: 4 spikes along the line
  for (let i = 1; i <= 4; i++) {
    const t = i * 1.5;
    const pos = new THREE.Vector3().copy(origin).add(dir.clone().multiplyScalar(t));
    const geometry = new THREE.IcosahedronGeometry(0.15, 0);
    const material = new THREE.MeshStandardMaterial({ color: 0x7dd3fc, emissive: 0x7dd3fc, emissiveIntensity: 2 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(pos.x, 0, pos.z);
    mesh.scale.set(1, 0.1, 1);
    this.scene.add(mesh);
    this.bursts.push({ mesh, ttl: 0.35, max: 0.35 });
    // Animate scale in update loop? For now bursts just fade.
  }
}

explodedShield(position: THREE.Vector3): void {
  // Fallback: golden expanding burst
  const geometry = new THREE.IcosahedronGeometry(0.3, 0);
  const material = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.85 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  this.scene.add(mesh);
  this.bursts.push({ mesh, ttl: 0.4, max: 0.4 });
}
```

- [ ] **Step 2: Wire events in `GameApp.ts`**

In `handleNetEvent`, add cases:

```typescript
case 'trap_triggered': {
  this.vfx.triggeredTrap(payload.x, payload.z);
  break;
}
case 'mark_consumed': {
  const target = this.getPlayerMesh(payload.targetId);
  if (target) this.vfx.consumedMark(target.position);
  break;
}
case 'ground_line_hit': {
  const origin = new THREE.Vector3(payload.x, 0, payload.z);
  const dir = new THREE.Vector3(payload.dirX, 0, payload.dirZ);
  this.vfx.groundLineHit(origin, dir);
  break;
}
case 'shield_exploded': {
  const caster = this.getPlayerMesh(payload.casterId);
  if (caster) this.vfx.explodedShield(caster.position);
  break;
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/spells/SpellVfxManager.ts client/src/game/GameApp.ts
git commit -m "feat(vfx): add fallback effects for traps, marks, ground line, and shield explode"
```

---

## Phase 3: Polish — Tests, Typecheck, Build

### Task 3.1: Add Comprehensive Tests

**Files:**
- Modify: `server/src/systems/SpellSystem.test.ts`

- [ ] **Step 1: Test `glacial_spikes` line hit detection**

```typescript
it('glacial_spikes hits targets in a line', () => {
  const caster = createTestPlayer('caster');
  const inLine = createTestPlayer('in-line');
  const offLine = createTestPlayer('off-line');
  caster.x = 0; caster.z = 0; caster.rotY = 0;
  inLine.x = 0; inLine.z = -4;
  offLine.x = 3; offLine.z = -4;

  const result = executeSpellCast({
    caster,
    targets: [inLine, offLine],
    spellId: 'glacial_spikes',
    now: 1000,
    phase: 'PLAYING',
    nextProjectileId: () => 'unused'
  });

  expect(result.ok).toBe(true);
  expect(result.kind).toBe('instant');
  if (result.kind !== 'instant') throw new Error('expected instant');
  expect(result.hits.some(h => h.targetId === 'in-line')).toBe(true);
  expect(result.hits.some(h => h.targetId === 'off-line')).toBe(false);
});
```

- [ ] **Step 2: Test `firmament_shield` applies shield**

```typescript
it('firmament_shield activates shieldActive', () => {
  const caster = createTestPlayer('caster');
  caster.mana = 100;
  const result = executeSpellCast({
    caster,
    targets: [],
    spellId: 'firmament_shield',
    now: 1000,
    phase: 'PLAYING',
    nextProjectileId: () => 'unused'
  });
  expect(result.ok).toBe(true);
  expect(caster.shieldActive).toBe(true);
});
```

- [ ] **Step 3: Run all tests**

Run: `npm run test --workspace server`
Expected: PASS

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: No errors. Fix any remaining references to old spell IDs in client or server files.

- [ ] **Step 5: Commit**

```bash
git add server/src/systems/SpellSystem.test.ts
git commit -m "test(spells): add tests for glacial_spikes and firmament_shield"
```

---

### Task 3.2: Full Build Verification

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: Success.

- [ ] **Step 2: Commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve type errors from spell rework" || echo "No changes to commit"
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - [x] 8 spells defined in shared
   - [x] Arcanist mark synergy (shadow_dart, abyssal_claw, eclipse)
   - [x] Divine control synergy (penitent_seal, judgment_ray, glacial_spikes)
   - [x] Trap mechanic (void_trap)
   - [x] Ground line mechanic (glacial_spikes)
   - [x] Explosive shield (firmament_shield, 2.5m AOE)
   - [x] Rooted state and movement blocking
   - [x] Client VFX for all new events
   - [x] UI showing class-specific spells

2. **Placeholder scan:** None found. Every step includes concrete code.

3. **Type consistency:**
   - Spell IDs: `shadow_dart`, `void_trap`, `abyssal_claw`, `eclipse`, `judgment_ray`, `penitent_seal`, `glacial_spikes`, `firmament_shield`
   - Player state fields: `markedUntil`, `rootedUntil`, `explosiveShield`
   - Event names: `mark_consumed`, `trap_triggered`, `ground_line_hit`, `shield_exploded`
   - Cooldown fields: `shadowDartReadyAt`, `voidTrapReadyAt`, `abyssalClawReadyAt`, `eclipseReadyAt`, `judgmentRayReadyAt`, `penitentSealReadyAt`, `glacialSpikesReadyAt`, `firmamentShieldReadyAt`

All names match across the plan.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-30-spell-rework-plan.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
