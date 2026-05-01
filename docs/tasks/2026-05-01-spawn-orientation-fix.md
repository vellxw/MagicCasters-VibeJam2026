# Spawn Orientation Fix

## Goal
Fix player spawn positions/orientations so players do not appear reversed and spawn calibration data is respected.

## Implementation Notes
- Trace spawn data from arena presets through server match initialization and client rendering.
- Identify whether the inversion is caused by spawn index assignment, `rotY`, team side mirroring, or coordinate conversion.
- Preserve calibrated positions and only fix the incorrect transform/assignment.

## Verification
- Add or update tests around spawn assignment and orientation.
- Smoke-check match spawn behavior after build/deploy.
