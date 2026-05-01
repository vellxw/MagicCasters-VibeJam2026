# Combat Keybindings

## Goal
Add a combat key configuration surface so players can replace the default spell keys with different keys, and make those choices persist across reloads.

## Implementation Notes
- Create a small client-side keybinding module that owns default combat action bindings, normalization, conflict handling, persistence, and slot-to-spell resolution.
- Keep the default spell bindings as `1`, `2`, `3`, `4`.
- Add a key assignment section to the existing Settings modal, because it is already the in-game settings surface and is hidden behind a top-right button.
- When a player clicks a binding row, capture the next non-reserved key press, prevent duplicates by unassigning the previous action using that key, save the result immediately, and update HUD labels.
- Keep movement, jump, Escape, Enter, and dev hotkeys out of the assignable combat spell set.

## Verification
- Add focused client tests for key normalization, persistence, duplicate reassignment, reset-to-defaults, and class spell resolution with custom bindings.
- Update HUD/settings tests where practical so displayed spell labels use current bindings.
- Run client tests, typecheck, and build.
