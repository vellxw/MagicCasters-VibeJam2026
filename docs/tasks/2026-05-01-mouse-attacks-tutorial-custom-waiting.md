# Mouse Attacks, Tutorial, and Custom Waiting Plan

## Goal
Ship a first-time, skippable game tutorial, mouse combat attacks, and custom 2v2 rooms that wait for invited players before filling with bots.

## Controls Contract
- Default combat bindings are: left mouse button for spell 1, right mouse button for spell 2, Q for spell 3, and E for spell 4.
- Number keys 1-4 remain valid fallback combat inputs so existing keyboard casting still works.
- Right-click on the game canvas does not open the browser context menu during play.
- Settings can capture mouse buttons as combat bindings, not just keyboard keys.

## Tutorial Contract
- First-time players see a full-game tutorial before entering the lobby.
- The tutorial is completely skippable and marks itself as seen whether skipped or completed.
- The tutorial covers lobby portals, class select, movement, jump/dash, mouse/Q/E attacks, voice/buttons, custom rooms, bots, teams, cooldowns, results, and rematch.
- Calibration/dev entry points skip the tutorial gate.

## Custom 2v2 Contract
- Custom 2v2 creation exposes invite planning for waiting on 2 or 3 human players before bots can fill.
- Custom bot fill supports an explicit requested bot count, capped by the remaining match slots.
- Bots are not added before the configured human gate is reached, so invited players can join and appear in the queue screen first.
- The queue screen shows the waiting roster, including invited humans and bots once added.

## Implementation Checklist
- [x] Add tests for mouse defaults, mouse resolution, right-click labels, and keyboard fallback.
- [x] Add tests for custom bot gating and capped bot counts.
- [x] Add join-option tests for custom human/bot count fields.
- [x] Implement combat input support for mouse buttons and settings capture.
- [x] Implement tutorial overlay, storage helpers, first-run gate, and CSS.
- [x] Implement custom 2v2 options, network/server options, bot gating, and queue roster UI.
- [x] Run targeted tests, then full typecheck, server tests, and build.
- [ ] Commit only this task's files, push `main`, and verify the push.
