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
