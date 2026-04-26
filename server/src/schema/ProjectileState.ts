import { Schema, type } from '@colyseus/schema';
import type { SpellId } from '../../../shared/spells.js';
import type { PublicProjectileState } from '../../../shared/types.js';

export class ProjectileState extends Schema implements PublicProjectileState {
  @type('string') id = '';
  @type('string') ownerId = '';
  @type('string') spellId: SpellId = 'fireball';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') z = 0;
  @type('number') dirX = 0;
  @type('number') dirY = 0;
  @type('number') dirZ = 0;
  @type('number') speed = 0;
  @type('number') ttl = 0;
  @type('number') radius = 0;

  constructor(snapshot?: PublicProjectileState, radius = 0) {
    super();
    if (!snapshot) return;
    this.id = snapshot.id;
    this.ownerId = snapshot.ownerId;
    this.spellId = snapshot.spellId as SpellId;
    this.x = snapshot.x;
    this.y = snapshot.y;
    this.z = snapshot.z;
    this.dirX = snapshot.dirX;
    this.dirY = snapshot.dirY;
    this.dirZ = snapshot.dirZ;
    this.speed = snapshot.speed;
    this.ttl = snapshot.ttl;
    this.radius = radius;
  }
}
