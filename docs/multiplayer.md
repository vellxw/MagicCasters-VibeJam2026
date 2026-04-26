# Multiplayer

## Transport

The server uses Colyseus with the room name `magic_match`.

- Package path: `server/src/rooms/MagicDuelRoom.ts`
- Client joins with `joinOrCreate("magic_match", { mode })`
- Matchmaking filters by `mode`, so `1v1` and `2v2` queues do not mix.
- `1v1`: max clients `2`, required players `2`
- `2v2`: max clients `4`, required players `4`
- No login or account flow
- Optional generated display name only

## Room Phases

- `WAITING`: the room is not full yet, or a rival left.
- `PLAYING`: the required player count is connected and server simulation is running.
- `ENDED`: one player was defeated; clients can return to the local lobby.

Rooms lock when full, when `PLAYING`, or when `ENDED`.

## Teams

- `1v1`: player slots assign teams `A`, `B`.
- `2v2`: player slots assign teams `A`, `B`, `A`, `B`.
- Server-side damage skips players on the caster/projectile owner's team.

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

In each tab, walk near the `1v1 Duel` portal and press `E`. Both tabs should connect to the same `1v1` room, show `players 2/2`, and enter `PLAYING`.

## Local Four-Tab Test

```bash
npm install
npm run dev
```

Open four tabs at `http://localhost:5173`, walk near the `2v2 Team Duel` portal in each tab, and press `E`. All four tabs should join the same `2v2` room, show `players 4/4`, and enter `PLAYING`.

## Regression Smoke: First Player Controls

Use this after changes to room state, local-player binding, or input handling:

1. Start the app with `npm run dev` or `npm run build && npm run start`.
2. Open tab 1, choose the `1v1 Duel` portal, and wait on `WAITING`.
3. Open tab 2 and choose the `1v1 Duel` portal so the room transitions to `PLAYING`.
4. In tab 1, confirm the debug overlay shows `local yes` and `controls yes`.
5. Move tab 1 with `WASD` and verify tab 2 sees that mage moving.
6. Move tab 2 with `WASD` and verify tab 1 sees that mage moving.

The local player must always be resolved as `room.state.players.get(room.sessionId)`, not by join order or map index.
