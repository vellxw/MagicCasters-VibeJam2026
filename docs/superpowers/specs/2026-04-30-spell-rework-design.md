# Spec: Nuevo Sistema de Hechizos — Sinergia por Clase

**Fecha:** 2026-04-30
**Autor:** Agent
**Estado:** Aprobado por diseño, pendiente de implementación

---

## 1. Resumen

Reemplazamos los 4 hechizos genéricos (`fireball`, `ice_bolt`, `light_burst`, `shadow_dash`) por **8 hechizos únicos** (4 por clase), diseñados con mecánicas de combo interno. Cada clase tiene una identidad jugable distinta:

- **Arcanist** (*Cazador de Sombras*): Aplica `Marca Umbría` → consume con burst/silencio → cura en AOE.
- **Divine** (*Juez Celestial*): Aplica control (silence/slow) → castiga con daño potenciado → picos desde suelo.

---

## 2. Hechizos por Clase

### 2.1 🌑 Arcanist — Cazador de Sombras

| # | ID | Nombre | Incantation | Tipo | Coste Mana | CD | Daño | Efecto Principal |
|---|----|--------|-------------|------|-----------|-----|------|------------------|
| 1 | `shadow_dart` | Dardo Sombrio | `nox` | `projectile` | 12 | 700ms | 10 | Aplica **Marca Umbría** 3s al impactar |
| 2 | `void_trap` | Trampa del Vacío | `umbra` | `trap` | 16 | 5000ms | 12 | Coloca trampa invisible en posición. Al pisarla, daño + **Marca Umbría** 3s. Dura 4s. Radio 1.5m |
| 3 | `abyssal_claw` | Garras Abisales | `abyssus` | `projectile` | 20 | 1200ms | 14 | Si target tiene **Marca**, consume marca: +8 daño y **silencia 0.8s** |
| 4 | `eclipse` | Eclipse | `exanima` | `instant` | 28 | 4500ms | 10 AOE | Nova circular 4m. Por cada enemigo **marcado** en área, consume marca: +10 daño a ese target, cura caster 5 HP |

### 2.2 ☀️ Divine — Juez Celestial

| # | ID | Nombre | Incantation | Tipo | Coste Mana | CD | Daño | Efecto Principal |
|---|----|--------|-------------|------|-----------|-----|------|------------------|
| 1 | `judgment_ray` | Rayo del Juicio | `fulgur` | `projectile` | 14 | 900ms | 14 | Si target está **silenciado o ralentizado**, +50% daño (21 total) |
| 2 | `penitent_seal` | Sello Penitente | `judicium` | `instant` | 22 | 3600ms | 6 AOE | Área circular 4m frente al caster. Aplica **silencio 1.0s** + **ralentización 1.5s** |
| 3 | `glacial_spikes` | Picos Glaciales | `glacius` | `ground_line` | 24 | 3000ms | 18 | Línea recta 7m × 1.2m frente al caster. Picos emergen del suelo. Si target está **silenciado o ralentizado**, aplica **root 0.5s** |
| 4 | `firmament_shield` | Escudo del Firmamento | `scutum` | `instant` | 18 | 5000ms | 0 | `shieldActive = true`. Si al activar hay un enemigo a <3m con **slow/silence**, el escudo es **explosivo**: al romperse, empuja 2m + 10 daño |

---

## 3. Estados de Jugador Nuevos/Modificados

En `ServerPlayer` / `PlayerState`:
- `markedUntil: number` — nuevo. Solo usado por arcanist.
- `shieldActive: boolean` — ya existe, reutilizado.
- `silencedUntil: number` — ya existe, reutilizado.
- `slowedUntil: number` — ya existe, reutilizado.
- `rootedUntil: number` — nuevo. Usado por divine (`glacial_spikes`). Impide todo movimiento horizontal.
- `explosiveShield: boolean` — nuevo. Solo usado por divine.

En `PublicPlayerState` (shared/types.ts): no es necesario exponer `markedUntil` ni `explosiveShield` al cliente (el servidor maneja todo), pero sí necesitamos enviar eventos de red cuando se consumen marcas o explota el escudo para sincronizar VFX.

---

## 4. Nuevos Tipos de Hechizo

### 4.1 `trap`
- Al castear, se crea un objeto `TrapState` con `x, z, radius=1.5, ownerId, spellId, expiresAt`.
- En `tick()` del room, se iteran traps activas. Si un enemigo (no owner) entra en el radio, aplica daño + marca + emite evento `trap_triggered` + elimina la trap.
- Máximo 1 trap activa por jugador (si coloca otra, la anterior desaparece).

### 4.2 `ground_line`
- Calcula rectángulo 7m × 1.2m frente al caster usando `directionFromRotation(rotY)`.
- Hit-test: para cada enemigo, proyectar su posición al eje de la línea. Si distancia perpendicular ≤ 0.6m y distancia longitudinal entre 0 y 7m → hit.
- Emite evento `ground_line_hit` con lista de targets para que el cliente renderice los picos.

---

## 5. Sinergias y Lógica de Combo

### 5.1 Arcanist — Consumo de Marca
- `abyssal_claw` al impactar: si `target.markedUntil > now`, entonces `target.markedUntil = 0`, daño = 22, `target.silencedUntil = now + 800`.
- `eclipse` al castear: para cada enemigo en radio 4m, si `markedUntil > now`, entonces `markedUntil = 0`, daño de ese target = 20, y `caster.hp = min(MAX_HP, caster.hp + 5)`.

### 5.2 Divine — Castigo Condicional
- `judgment_ray` al impactar: si `target.silencedUntil > now || target.slowedUntil > now`, daño = 21.
- `glacial_spikes` al impactar: si `target.silencedUntil > now || target.slowedUntil > now`, `target.rootedUntil = now + 500`.
- `firmament_shield` al activar: busca enemigo a <3m con `silencedUntil > now || slowedUntil > now`. Si existe, marca `explosiveShield = true` en el caster. Cuando `applyDamage` consume `shieldActive`, si `explosiveShield`, entonces: empuja al enemigo más cercano 2m, le hace 10 daño, y `explosiveShield = false`.

---

## 6. Eventos de Red Nuevos

| Evento | Payload | Dirección | Uso |
|--------|---------|-----------|-----|
| `mark_consumed` | `{ targetId, spellId, x, z }` | Server → Client | VFX de marca consumida (destello en el enemigo) |
| `trap_triggered` | `{ trapOwnerId, targetId, x, z }` | Server → Client | VFX de trampa activada |
| `ground_line_hit` | `{ casterId, targetIds[], x, z, dirX, dirZ }` | Server → Client | VFX de picos emergiendo desde el suelo |
| `shield_exploded` | `{ casterId, targetId, x, z }` | Server → Client | VFX de escudo explosivo rompiéndose |

---

## 7. VFX del Cliente (Fallback / Reutilización)

Dado que usamos fallback geometry por ahora:
- `shadow_dart_projectile` / `abyssal_claw_projectile`: esferas oscuras (reutilizar fallback, color diferente).
- `judgment_ray_projectile`: esfera dorada.
- `trap`: invisible en servidor, pero el cliente puede mostrar un destello sutil cuando se coloca (opcional, podemos omitir).
- `ground_line_hit`: geometría de icosaedros que escalan desde Y=0 a Y=2.5 en 0.3s, luego desaparecen. Línea de 3-4 picos espaciados.
- `eclipse`: torus que se expande (ya existe fallback para `dash`).
- `mark_consumed`: pequeño burst de partículas negras en posición del enemigo.
- `shield_explode`: burst dorado + knockback visual.

---

## 8. Mapeo de Teclas e Incantaciones por Clase

Cada jugador solo ve los 4 hechizos de su clase:

| Slot | Tecla | Arcanist | Divine |
|------|-------|----------|--------|
| 1 | `1` | Dardo Sombrio (`nox`) | Rayo del Juicio (`fulgur`) |
| 2 | `2` | Trampa del Vacío (`umbra`) | Sello Penitente (`judicium`) |
| 3 | `3` | Garras Abisales (`abyssus`) | Picos Glaciales (`glacius`) |
| 4 | `4` | Eclipse (`exanima`) | Escudo del Firmamento (`scutum`) |

Voice casting reconoce las 4 incantaciones según la clase del jugador.

---

## 9. Archivos a Modificar

1. **`shared/spells.ts`** — Definiciones de hechizos nuevos, `SPELL_IDS`, `SPELLS`, `CLASS_SPELL_VARIANTS`, helpers de resolución.
2. **`shared/classes.ts`** — Actualizar `spellIds` de cada clase.
3. **`shared/types.ts`** — Añadir `PublicTrapState` y `PublicGroundLineEffect` si se requiere sincronizar estado visual.
4. **`server/src/schema/PlayerState.ts`** — Añadir `markedUntil`, `explosiveShield`.
5. **`server/src/schema/`** — Nuevo `TrapState.ts` si se usa schema de Colyseus para sincronizar traps (alternativa: manejar puramente en servidor).
6. **`server/src/systems/SpellSystem.ts`** — `validateCast`, `executeSpellCast` con lógica de `trap` y `ground_line`. Añadir `TrapState` y gestión.
7. **`server/src/rooms/MagicDuelRoom.ts`** — Tick de traps, aplicar efectos de clase en `applyClassSpellEffects`, broadcast de nuevos eventos.
8. **`client/src/spells/SpellVfxManager.ts`** — Manejar `ground_line_hit`, `trap_triggered`, `mark_consumed`, `shield_exploded`.
9. **`client/src/game/GameApp.ts`** — Escuchar nuevos eventos y delegar a VFX.
10. **`client/src/ui/DebugOverlay.ts`** — Actualizar botones de hechizos según clase.

---

## 10. Alcance y Limitaciones Intencionales

- **NO** modificamos collision walls en runtime (evita complejidad innecesaria).
- **NO** añadimos geometría de picos como obstáculos físicos; es daño + root visual.
- **NO** cambiamos el sistema de mana, regen, ni cámaras.
- Las traps son invisibles para el enemigo (fairness por cooldown largo).
- Los picos glaciales no bloquean movimiento; solo hacen daño y root condicional.
