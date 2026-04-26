# Voice Casting

Voice casting is implemented in `client/src/voice/VoiceCommandManager.ts`.

## Browser API

The client uses:

- `window.SpeechRecognition`
- `window.webkitSpeechRecognition`

If the API is unavailable, the HUD keeps keyboard casting available.

## Commands

| Voice | Keyboard | Spell |
| --- | --- | --- |
| `ignis` | `1` | fireball |
| `gelu` | `2` | ice bolt |
| `lux` | `3` | light burst |
| `umbra` | `4` | shadow dash |

## Flow

1. Player clicks `Voice`.
2. Browser asks for microphone permission if needed.
3. Final speech transcripts are normalized and matched to incantations.
4. The client sends a Colyseus `cast` message with the spell id.
5. The server validates phase, mana, cooldown, and player state.
6. The server creates the projectile, applies the instant spell, or moves the dash.
7. Clients render VFX after server confirmation.

## Fallback

Keyboard casting is the reliable fallback and uses the same server validation path as voice casting.
