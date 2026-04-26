# Technical Spec

## Stack

Client:

- Vite
- TypeScript
- Three.js
- Browser SpeechRecognition / webkitSpeechRecognition when available

Server:

- Node.js
- TypeScript
- Colyseus
- `@colyseus/core`
- `@colyseus/schema`
- `@colyseus/ws-transport`

Shared:

- spell IDs
- network message types
- constants

## Project Structure

```txt
/client
  index.html
  /src
    main.ts
    /game
      GameApp.ts
    /player
      LocalPlayerController.ts
      RemotePlayerController.ts
    /camera
      ThirdPersonCamera.ts
    /voice
      VoiceCommandManager.ts
    /spells
      SpellVfxManager.ts
    /network
      NetworkClient.ts
    /ui
      DebugOverlay.ts
    /world
      Arena.ts
  /public
  package.json
  vite.config.ts
  tsconfig.json

/server
  /src
    index.ts
    /rooms
      MagicDuelRoom.ts
    /schema
      GameState.ts
      PlayerState.ts
      ProjectileState.ts
    /systems
      SpellSystem.ts
      MovementSystem.ts
  package.json
  tsconfig.json

/shared
  spells.ts
  net.ts
  types.ts

/docs
  /codex
  migration-from-old-prototype.md
  multiplayer.md
  voice-casting.md
  jam-compliance.md
  future-gaussian-splat-arena.md

README.md
package.json
.gitignore
.env.example
```

## Multiplayer

Room name:

```txt
magic_duel
```

Room rules:

- `maxClients = 2`
- no login
- optional username
- player 1 spawns on one side
- player 2 spawns opposite
- if one player leaves, the other returns to waiting/end state

Room phases:

- WAITING
- PLAYING
- ENDED

Server authority:

- server owns HP
- server owns mana
- server validates casts
- server validates cooldowns
- server owns projectile state
- server applies damage
- client does not apply confirmed damage directly

Client prediction:

- keep local movement responsive
- remote player interpolates smoothly
- do not overbuild prediction if time is limited

## State

GameState:

- phase
- tick
- players
- projectiles

PlayerState:

- id
- name
- x, y, z
- rotY
- anim
- hp
- mana
- casting
- selectedSpell

ProjectileState:

- id
- ownerId
- spellId
- x, y, z
- dirX, dirY, dirZ
- speed
- ttl

## Voice Casting

Voice commands:

- ignis -> fireball
- gelu -> ice_bolt
- lux -> light_burst
- umbra -> shadow_dash

Flow:

1. Browser detects voice command.
2. Client sends cast intent to Colyseus.
3. Server validates phase, mana, cooldown and player state.
4. Server broadcasts confirmed spell.
5. Clients show VFX only after server confirmation.

Keyboard fallback:

- 1 = fireball
- 2 = ice_bolt
- 3 = light_burst
- 4 = shadow_dash

## VibeJam Widget

`client/index.html` MUST include:

```html
<script async src="https://vibej.am/2026/widget.js"></script>
```

## Performance

Required:

- no loading screen
- quick first interaction
- lightweight assets
- use primitives/simple meshes if needed
- avoid huge GLB files
- avoid huge textures
- no Gaussian Splat for jam build unless later explicitly requested
