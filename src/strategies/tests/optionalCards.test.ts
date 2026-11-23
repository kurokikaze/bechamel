import { jest } from '@jest/globals';
import { State } from 'moonlands/dist/esm/index.js';
import CardInGame from 'moonlands/dist/esm/classes/CardInGame.js';
import { byName } from 'moonlands/dist/esm/cards.js';
import {
  ACTION_POWER, ACTION_RESOLVE_PROMPT, PROMPT_TYPE_CHOOSE_UP_TO_N_CARDS_FROM_ZONE,
  ZONE_TYPE_ACTIVE_MAGI, ZONE_TYPE_HAND,
} from 'moonlands/dist/esm/const.js';
import { createZones } from '../simulationUtils.js';
import { ActionExtractor } from '../ActionExtractor.js';
import { DirectActionExtractor } from '../DirectActionExtractor.js';
import { HashBuilder } from '../HashBuilder.js';
import { SimulationStrategy } from '../SimulationStrategy.js';
import UnexpectedPromptResolver from '../UnexpectedPromptResolver.js';

function mindwinds() {
  const card = (name: string, id: string) => new CardInGame(byName(name)!, 1, () => id);
  const source = card('Cloud Sceptre', 'sceptre');
  const game = new State({ zones: createZones(1, 2, [source]), step: 1, activePlayer: 1 } as any);
  game.setPlayers(1, 2);
  game.initiatePRNG(1);
  game.getZone(ZONE_TYPE_ACTIVE_MAGI, 1).add([card('Lasada', 'magi').addEnergy(10)]);
  game.getZone(ZONE_TYPE_HAND, 1).add([card('Xyx Minor', 'only-card')]);
  game.update({ type: ACTION_POWER, source, power: source.card.data.powers![0], player: 1 } as any);
  return game;
}

describe('optional card selection (Mindwinds, triage run 0018)', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('generates zero through maximum choices with zone context in the outgoing command', () => {
    const game = mindwinds();
    expect(game.state.promptType).toBe(PROMPT_TYPE_CHOOSE_UP_TO_N_CARDS_FROM_ZONE);
    const branches = ActionExtractor.extractActions(game, 1, 2, [], 'start', new HashBuilder());
    expect(branches.map(branch => (branch.action as any).cards.length)).toEqual([0, 1]);
    const strategy = new SimulationStrategy();
    strategy.setup({ getPromptType: () => null } as any, 1); // Created before the real prompt, as in held plans.
    const reply = (strategy as any).simulationActionToClientAction(branches[0].action);
    expect(reply).toMatchObject({ type: ACTION_RESOLVE_PROMPT, cards: [], zone: ZONE_TYPE_HAND, zoneOwner: 1 });
    expect(() => branches[0].sim.update(branches[0].action)).not.toThrow();
    expect(branches[0].sim.state.prompt).toBe(false);
    expect(branches[0].sim.getZone(ZONE_TYPE_HAND, 1).cards.map(card => card.id)).toEqual(['only-card']);
    const direct = DirectActionExtractor.extractActions(game, 1, 2).filter(action => action.type === 'CARDS');
    expect(direct.map(action => action.type === 'CARDS' ? action.cardIds.length : -1)).toEqual([0, 1]);
  });

  it('still generates the valid empty resolution when no cards can be chosen', () => {
    const game = mindwinds();
    game.getZone(ZONE_TYPE_HAND, 1).cards = [];
    game.state.promptParams.cards = [];
    game.state.promptParams.numberOfCards = 0;
    const branches = ActionExtractor.extractActions(game, 1, 2, [], 'start', new HashBuilder());
    expect(branches).toHaveLength(1);
    expect((branches[0].action as any).cards).toEqual([]);
    const direct = DirectActionExtractor.extractActions(game, 1, 2).filter(action => action.type === 'CARDS');
    expect(direct).toHaveLength(1);
    const fallback: any = new UnexpectedPromptResolver().resolvePrompt({
      playerId: 1, getPromptType: () => PROMPT_TYPE_CHOOSE_UP_TO_N_CARDS_FROM_ZONE,
      state: { promptParams: { zone: ZONE_TYPE_HAND, zoneOwner: 1, cards: [], numberOfCards: 0 } },
    } as any);
    expect(fallback.cards).toEqual([]);
    expect(fallback.number).toBeUndefined();
  });
});
