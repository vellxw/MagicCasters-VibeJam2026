# Fly.io Production Deploy

VibeJam Magic Duel runs on Fly.io as one Dockerized Node service. The same process serves `client/dist` over HTTPS and accepts Colyseus WebSocket upgrades on the same origin.

## Recommended App

- Region: `iad` for Ashburn, Virginia / US East players
- Machine: `shared-cpu-1x`, `1024 MB`
- Internal port: `8080`
- Autostop: disabled for smoother public playtests
- Deploy command: `fly deploy`

The root `fly.toml` and `Dockerfile` encode this baseline.

## First Fly Setup

```bash
fly auth login
fly apps create vibejam-magic-duel
fly deploy
```

Fly app names are globally unique. If `vibejam-magic-duel` is taken, create a different app name and update the `app` field in `fly.toml`.

## Environment

Keep production simple:

```bash
NODE_ENV=production
PORT=8080
```

Do not set `VITE_COLYSEUS_URL` for the Fly app unless Colyseus is hosted separately. When omitted, the browser client uses the current HTTPS origin and connects with `wss://`.

## Why Autostop Is Off

Fly can stop or suspend idle Machines, but for a realtime browser game that means the first player after idle can hit a cold start. The production config keeps one Machine running in the primary region so public sessions feel immediate.

## Smoke Test

After deploy:

1. Open `https://vibejam-magic-duel.fly.dev` or the app URL shown by Fly.
2. Confirm the browser connects with `wss://` in DevTools Network.
3. Join with two browser sessions and verify both enter the same Colyseus room.
4. Play for 5-10 minutes and watch for disconnects or reconnection loops.
5. Test mobile landscape fullscreen controls from the public URL.
