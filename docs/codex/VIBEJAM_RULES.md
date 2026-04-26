# VibeJam 2026 Rules — Mandatory Compliance

This project is intended for VibeJam 2026.

## Rules

1. Anyone can enter with their game.
2. REQUIRED: Add the VibeJam widget JS snippet to the game HTML. Games without it are disqualified.
3. At least 90% of the code has to be written by AI.
4. Only NEW games created during the jam period are accepted. Do not submit games that existed prior to April 1, 2026.
5. Game must be accessible on the web without login or signup and free-to-play.
6. Multiplayer games are preferred but not required.
7. Any engine is allowed, but Three.js is recommended.
8. NO loading screens and no heavy downloads. The player must be almost instantly in the game, except maybe asking for username.
9. One entry per person. Focus on making one really good game.
10. Deadline: May 1, 2026 at 13:37 UTC.
11. The game can be submitted now and updated until the deadline.

## Required Widget

The following snippet MUST be included in the game HTML:

```html
<script async src="https://vibej.am/2026/widget.js"></script>
```

## Domain Rule

The game must be deployed on a single domain or subdomain because the widget tracks entrants and popularity by domain.

## Compliance Requirements For This Repo

The final game must:

- Be a new game project created in this repository.
- Use the old prototype only as reference unless specific copied code is clearly marked and justified.
- Keep at least 90% of final code AI-generated.
- Include the VibeJam widget snippet in `client/index.html`.
- Be playable on web without login/signup.
- Be free-to-play.
- Start almost instantly.
- Avoid large downloads.
- Avoid heavy models/textures for the jam build.
- Avoid loading screens.
- Be focused on one strong 1v1 magic duel experience.
