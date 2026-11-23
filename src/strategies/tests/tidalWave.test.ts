import { State } from 'moonlands/dist/esm/index.js';
import CardInGame from 'moonlands/dist/esm/classes/CardInGame.js';
import { byName } from 'moonlands/dist/esm/cards.js';
import { PROMPT_TYPE_CHOOSE_UP_TO_N_CARDS_FROM_ZONE, ZONE_TYPE_IN_PLAY } from 'moonlands/dist/esm/const.js';
import { ActionExtractor } from '../ActionExtractor.js';
import { DirectActionExtractor } from '../DirectActionExtractor.js';
import { HashBuilder } from '../HashBuilder.js';
import { createZones } from '../simulationUtils.js';

it('offers skipping or selecting each eligible creature for Tidal Wave', () => {
  const first = new CardInGame(byName('Lovian')!, 2).addEnergy(4);
  const targets = [new CardInGame(byName('Rudwot')!, 2).addEnergy(3), new CardInGame(byName('Furok')!, 1).addEnergy(4)];
  const sim = new State({
    ...new State().state,
    zones: createZones(1, 2, [first, ...targets]),
    activePlayer: 1,
    step: 1,
    prompt: true,
    promptPlayer: 1,
    promptType: PROMPT_TYPE_CHOOSE_UP_TO_N_CARDS_FROM_ZONE,
    promptParams: { zone: ZONE_TYPE_IN_PLAY, zoneOwner: 1, numberOfCards: 1, cards: targets.map(card => card.serialize()) },
  });
  sim.setPlayers(1, 2);
  const expected = [[], ...targets.map(card => [card.id])];
  const branches = ActionExtractor.extractActions(sim, 1, 2, [], 'start', new HashBuilder());
  expect(branches.map(({ action }) => (action as { cards: CardInGame[] }).cards.map(card => card.id))).toEqual(expected);
  const direct = DirectActionExtractor.extractActions(sim, 1, 2).filter(action => action.type === 'CARDS');
  expect(direct.map(action => action.cardIds)).toEqual(expected);
});
