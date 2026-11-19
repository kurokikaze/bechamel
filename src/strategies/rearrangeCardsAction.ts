import { ACTION_RESOLVE_PROMPT, PROMPT_TYPE_REARRANGE_CARDS_OF_ZONE } from 'moonlands/dist/esm/const.js';
import { AnyEffectType } from 'moonlands/dist/esm/types/index.js';

export function rearrangeCardsAction(cards: string[], generatedBy: string | undefined, player: number): AnyEffectType {
  // Published Moonlands 0.40.2 declares cardsOrder, but its resolver actually
  // reads cards:string[]. Keep this compatibility cast confined to the adapter;
  // the source declaration is corrected in Moonlands for its next release.
  return {
    type: ACTION_RESOLVE_PROMPT,
    promptType: PROMPT_TYPE_REARRANGE_CARDS_OF_ZONE,
    cards,
    generatedBy,
    player,
  } as unknown as AnyEffectType;
}
