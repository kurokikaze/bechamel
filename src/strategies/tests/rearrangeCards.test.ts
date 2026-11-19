import { jest } from '@jest/globals';
import { State } from 'moonlands/dist/esm/index.js';
import { byName } from 'moonlands/dist/esm/cards.js';
import Card from 'moonlands/dist/esm/classes/Card.js';
import CardInGame from 'moonlands/dist/esm/classes/CardInGame.js';
import {
  ACTION_POWER, ACTION_RESOLVE_PROMPT, PROMPT_TYPE_REARRANGE_CARDS_OF_ZONE,
  ZONE_TYPE_ACTIVE_MAGI, ZONE_TYPE_DECK,
} from 'moonlands/dist/esm/const.js';
import { createZones } from '../simulationUtils.js';
import { ActionExtractor } from '../ActionExtractor.js';
import { DirectActionExtractor } from '../DirectActionExtractor.js';
import { HashBuilder } from '../HashBuilder.js';
import { SimulationStrategy } from '../SimulationStrategy.js';
import { ReconSimulationStrategy } from '../ReconSimulationStrategy.js';
import { GameState } from '../../GameState.js';
import { convertServerCommand } from 'duel-protocol/commands';

function prophecy(beforePower?: (game: State) => void) {
  const game = new State({ zones: createZones(1, 2), step: 1, activePlayer: 1 } as any);
  game.setPlayers(1, 2);
  game.initiatePRNG(1);
  const barak = new CardInGame(byName('Barak') as Card, 1).addEnergy(10);
  game.getZone(ZONE_TYPE_ACTIVE_MAGI, 1).add([barak]);
  const deck = ['Arbolit', 'Lava Balamant', 'Thermal Blast', 'Fire Ball', 'Diobor'].map(name => new CardInGame(byName(name) as Card, 1));
  game.getZone(ZONE_TYPE_DECK, 1).add(deck);
  beforePower?.(game);
  game.update({ type: ACTION_POWER, source: barak, power: barak.card.data.powers![0], player: 1 } as any);
  expect(game.state.promptType).toBe(PROMPT_TYPE_REARRANGE_CARDS_OF_ZONE);
  return { game, barak, ids: deck.map(card => card.id) };
}

describe('Barak Prophecy prompt resolution (triage run 0006)', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('resolves the cloned search branch and writes the custom metadata variable', () => {
    const { game, barak, ids } = prophecy();
    const [branch] = ActionExtractor.extractActions(game, 1, 2, [], 'start', new HashBuilder());
    expect((branch.action as any).cards).toEqual(ids.slice(0, 4));
    expect(() => branch.sim.update(branch.action)).not.toThrow();
    expect(branch.sim.state.prompt).toBe(false);
    expect(branch.sim.getSpellMetadata(barak.id).rearrangedCards).toEqual(ids.slice(0, 4));
    expect(branch.sim.getZone(ZONE_TYPE_DECK, 1).cards.map(card => card.id)).toEqual(ids);
    expect(game.state.prompt).toBe(true); // Searching must leave the original untouched.

    const strategy = new SimulationStrategy();
    const command = (strategy as any).simulationActionToClientAction(branch.action);
    expect(command.cards).toEqual(ids.slice(0, 4));
    expect(command.cardsOrder).toBeUndefined();
  });

  it('applies a nontrivial order through the recon action adapter', () => {
    const { game, barak, ids } = prophecy();
    const order = ids.slice(0, 4).reverse();
    DirectActionExtractor.applyAction(game, { type: 'CARDS_ORDER', cardsOrder: order, label: 'Reverse' }, 1, 2);
    expect(game.getZone(ZONE_TYPE_DECK, 1).cards.map(card => card.id)).toEqual([...order, ids[4]]);
    expect(game.getSpellMetadata(barak.id).rearrangedCards).toEqual(order);
    const command = (new ReconSimulationStrategy() as any).directActionToClientAction({ type: 'CARDS_ORDER', cardsOrder: order });
    expect(command.cards).toEqual(order);
    expect(command.cardsOrder).toBeUndefined();
  });

  it.each([SimulationStrategy, ReconSimulationStrategy])('%p retains live Prophecy choices and can resolve it without a held plan', Strategy => {
    let live!: GameState;
    const { ids, barak } = prophecy(game => {
      live = new GameState(game.serializeData(1) as any);
      live.setPlayerId(1);
      game.setOnAction(action => {
        const command = convertServerCommand(action, game, 1);
        if (command) live.update(command);
      });
    });
    expect(live.state.promptParams.cards?.map(card => card.id)).toEqual(ids.slice(0, 4));
    expect(live.state.promptParams.zone).toBe(ZONE_TYPE_DECK);
    expect(live.state.promptParams.numberOfCards).toBe(4);
    const strategy = new Strategy();
    strategy.setup(live, 1);
    const reply: any = strategy.requestAction();
    expect(reply.cards).toEqual(ids.slice(0, 4));
    expect(reply.generatedBy).toBe(barak.id);
    expect(reply.number).toBeUndefined();
  });
});
