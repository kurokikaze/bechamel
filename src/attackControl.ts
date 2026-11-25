import type { StateRepresentation } from './types.js';
import { PROPERTY_CONTROLLING_PLAYER, SELECTOR_CREATURES_OF_PLAYER, EXPIRATION_DURING_PLAYER_TURNS, EXPIRATION_DURING_OPPONENT_TURNS } from 'moonlands/dist/esm/const.js';

export function getControllingPlayer(state: Pick<StateRepresentation, 'activePlayer' | 'step' | 'continuousEffects'>): number {
  if (state.step !== 2) return state.activePlayer;
  for (const effect of state.continuousEffects) {
    if ([EXPIRATION_DURING_PLAYER_TURNS, EXPIRATION_DURING_OPPONENT_TURNS].includes(effect.expiration.type) && effect.expiration.active !== true) continue;
    for (const ability of effect.staticAbilities) {
      if (ability.property === PROPERTY_CONTROLLING_PLAYER
        && (!ability.activeDuringSteps || ability.activeDuringSteps.includes('attack'))
        && (ability.selector !== SELECTOR_CREATURES_OF_PLAYER || ability.selectorParameter === state.activePlayer)
        && typeof ability.modifier.operandOne === 'number') return ability.modifier.operandOne;
    }
  }
  return state.activePlayer;
}
