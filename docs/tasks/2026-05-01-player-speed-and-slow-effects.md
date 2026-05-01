# Player Speed And Slow Effects

## Goal
Make all players slightly slower overall, make every attack from both characters apply a mild slow, and make attacks that already slow apply a stronger slow.

## Implementation Notes
- Find the authoritative movement speed constants in shared/server gameplay code.
- Tune global movement speed conservatively so the game still feels responsive.
- Apply mild slow metadata/effects to all damaging/offensive spells for both characters.
- Increase existing slow magnitude/duration without turning it into a root.

## Verification
- Add or update server gameplay tests for global movement speed and slow application.
- Run server tests, client tests, typecheck, and build.
