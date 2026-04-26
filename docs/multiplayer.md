# Multiplayer

## Transport

The server uses Colyseus with the room name `magic_duel`.

- Package path: `server/src/rooms/MagicDuelRoom.ts`
- Max clients: `2`
- Client joins with `joinOrCreate("magic_duel")`
- No login or account flow
- Optional generated display name only

## Room Phases

- `WAITING`: one player is connected, or a rival left.
- `PLAYING`: two players are connected and server simulation is running.
- `ENDED`: one player was defeated; the room resets after a short pause if both players remain.

## Authority Model

The server owns:

- HP and mana
- cooldown validation
- spell costs
- projectile creation and movement
- projectile hit detection
- instant spell damage
- dash distance and arena clamping
- phase changes

The client sends:

- movement intent
- aim rotation
- spell cast intent

The client never applies confirmed damage directly. It renders state and VFX after Colyseus state patches or server messages.

## Local Two-Tab Test

```bash
npm install
npm run dev
```

Then open:

```txt
http://localhost:5173
http://localhost:5173
```

Both tabs should connect to the same room, show `players 2`, and enter `PLAYING`.

## Regression Smoke: First Player Controls

Use this after changes to room state, local-player binding, or input handling:

1. Start the app with `npm run dev` or `npm run build && npm run start`.
2. Open tab 1 and wait on `WAITING`.
3. Open tab 2 so the room transitions to `PLAYING`.
4. In tab 1, confirm the debug overlay shows `local yes` and `controls yes`.
5. Move tab 1 with `WASD` and verify tab 2 sees that mage moving.
6. Move tab 2 with `WASD` and verify tab 1 sees that mage moving.

The local player must always be resolved as `room.state.players.get(room.sessionId)`, not by join order or map index.
