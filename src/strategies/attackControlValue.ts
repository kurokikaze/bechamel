import type { State } from 'moonlands/dist/esm/index.js';
import * as C from 'moonlands/dist/esm/const.js';

// Estimate only the future attack step. Once that step starts, the ordinary
// search scores actual combat (including Bwill's Karma), without this bonus.
export function attackControlValue(state: State, perspective: number): number {
  if (!state.state.continuousEffects.length) return 0;
  const creatures = state.getZone(C.ZONE_TYPE_IN_PLAY).cards.filter(card => card.card.type === C.TYPE_CREATURE);
  const values = new Map<number, number>();
  for (const effect of state.state.continuousEffects) {
    if (effect.expiration.turns !== undefined && effect.expiration.turns <= 0) continue;
    if ('active' in effect.expiration && effect.expiration.active === true && state.state.step !== null && state.state.step >= 2) continue;
    for (const ability of effect.staticAbilities ?? []) {
      if (ability.property !== C.PROPERTY_CONTROLLING_PLAYER || ability.selector !== C.SELECTOR_CREATURES_OF_PLAYER) continue;
      const caster = ability.modifier.operandOne;
      const controlled = ability.selectorParameter;
      if (typeof caster !== 'number' || typeof controlled !== 'number' || caster === controlled) continue;
      const enemies = creatures.filter(card => state.modifyByStaticAbilities(card, C.PROPERTY_CONTROLLER) === controlled
        && state.modifyByStaticAbilities(card, C.PROPERTY_ABLE_TO_ATTACK))
        .sort((a, b) => b.data.energy - a.data.energy);
      const own = creatures.filter(card => state.modifyByStaticAbilities(card, C.PROPERTY_CONTROLLER) === caster);
      const bwills = own.filter(card => card.card.name === 'Bwill' && state.modifyByStaticAbilities(card, C.PROPERTY_CAN_BE_ATTACKED))
        .sort((a, b) => a.data.energy - b.data.energy);
      const remaining = [...enemies];
      let karma = 0;
      for (const bwill of bwills) {
        const index = remaining.findIndex(card => card.data.energy > bwill.data.energy);
        if (index !== -1) {
          karma += remaining[index].data.energy - bwill.data.energy;
          remaining.splice(index, 1);
        }
      }
      const threatenedEnergy = Math.min(enemies.reduce((sum, card) => sum + card.data.energy, 0),
        own.reduce((sum, card) => sum + card.data.energy, 0) + (state.getZone(C.ZONE_TYPE_ACTIVE_MAGI, caster).card?.data.energy ?? 0));
      // Discount the forecast: the opponent still has a PRS step before attacks.
      const value = Math.max(karma * 0.75, threatenedEnergy * 0.35);
      values.set(caster, Math.max(values.get(caster) ?? 0, value));
    }
  }
  return [...values].reduce((sum, [caster, value]) => sum + (caster === perspective ? value : -value), 0);
}
