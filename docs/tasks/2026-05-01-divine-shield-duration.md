# Divine Shield Duration

## Goal
Make the divine wizard shield last exactly 5 seconds.

## Implementation Notes
- Locate the divine/healer shield spell configuration and its server-side state field.
- Change the duration constant/config to 5000 ms.
- Keep cooldown, visuals, and other shield behavior unchanged unless tests show coupling.

## Verification
- Add or update spell tests to assert the shield expiration time.
- Run full verification before deploy.
