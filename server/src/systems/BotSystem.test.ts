import { describe, expect, it } from 'vitest';
import { DEFAULT_AUTO_BOT_SKILL } from '../../../shared/types';
import { createTestPlayer } from './SpellSystem';
import {
  chooseBotSpell,
  chooseBotTarget,
  createBotController,
  createBotMoveInput,
  getBotSkillConfig,
  normalizeBotSkill
} from './BotSystem';

describe('BotSystem', () => {
  it('normalizes known bot skill values and rejects unknown values', () => {
    expect(DEFAULT_AUTO_BOT_SKILL).toBe('adept');
    expect(normalizeBotSkill('novice')).toBe('novice');
    expect(normalizeBotSkill('adept')).toBe('adept');
    expect(normalizeBotSkill('master')).toBe('master');
    expect(normalizeBotSkill('')).toBeNull();
    expect(normalizeBotSkill('nightmare')).toBeNull();
  });

  it('scales reaction and aim by skill', () => {
    expect(getBotSkillConfig('novice').reactionMs).toBeGreaterThan(getBotSkillConfig('adept').reactionMs);
    expect(getBotSkillConfig('adept').reactionMs).toBeGreaterThan(getBotSkillConfig('master').reactionMs);
    expect(getBotSkillConfig('novice').aimErrorRadians).toBeGreaterThan(getBotSkillConfig('master').aimErrorRadians);
  });

  it('targets the closest living enemy and ignores allies or defeated players', () => {
    const bot = createTestPlayer('bot_1', 'A');
    const ally = createTestPlayer('ally', 'A');
    const farEnemy = createTestPlayer('far', 'B');
    const nearEnemy = createTestPlayer('near', 'B');
    const defeatedEnemy = createTestPlayer('defeated', 'B');
    farEnemy.x = 6;
    nearEnemy.x = 2;
    defeatedEnemy.x = 1;
    defeatedEnemy.hp = 0;

    expect(chooseBotTarget(bot, [ally, farEnemy, nearEnemy, defeatedEnemy])?.id).toBe('near');
  });

  it('moves toward distant targets and backs away when too close', () => {
    const bot = createTestPlayer('bot_1', 'A');
    const target = createTestPlayer('target', 'B');
    const controller = createBotController('bot_1', 'adept');
    target.z = -8;

    const chase = createBotMoveInput(bot, target, controller, 1000);
    expect(chase.forward).toBe(true);
    expect(chase.backward).toBe(false);

    target.z = -1;
    const retreat = createBotMoveInput(bot, target, controller, 1200);
    expect(retreat.backward).toBe(true);
  });

  it('chooses class-legal spells and prioritizes arcanist mark combos for stronger bots', () => {
    const bot = createTestPlayer('bot_1', 'A', 'arcanist');
    const target = createTestPlayer('target', 'B');
    target.markedUntil = 5000;

    expect(chooseBotSpell(bot, target, 'master', 1000, 'PLAYING')).toBe('abyssal_claw');
    expect(chooseBotSpell(bot, target, 'novice', 1000, 'PLAYING')).toBe('shadow_dart');
  });
});
