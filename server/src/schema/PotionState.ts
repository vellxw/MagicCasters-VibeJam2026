import { Schema, type } from '@colyseus/schema';
import type { PotionLifecycleState, PotionType, PublicPotionState } from '../../../shared/types.js';

export class PotionState extends Schema implements PublicPotionState {
  @type('string') id = '';
  @type('string') type: PotionType = 'health';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') z = 0;
  @type('string') state: PotionLifecycleState = 'falling';
  @type('number') spawnedAt = 0;
  @type('number') landedAt = 0;
  @type('number') expiresAt = 0;

  constructor(snapshot?: PublicPotionState) {
    super();
    if (!snapshot) return;
    this.id = snapshot.id;
    this.type = snapshot.type;
    this.x = snapshot.x;
    this.y = snapshot.y;
    this.z = snapshot.z;
    this.state = snapshot.state;
    this.spawnedAt = snapshot.spawnedAt;
    this.landedAt = snapshot.landedAt;
    this.expiresAt = snapshot.expiresAt;
  }
}
