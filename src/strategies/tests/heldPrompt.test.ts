import { jest } from '@jest/globals';
import { State } from 'moonlands/dist/esm/index.js';
import Card from 'moonlands/dist/esm/classes/Card.js';
import CardInGame from 'moonlands/dist/esm/classes/CardInGame.js';
import { byName } from 'moonlands/dist/esm/cards.js';
import {
  ACTION_POWER, ACTION_RESOLVE_PROMPT, ACTION_PASS,
  PROMPT_TYPE_SINGLE_CREATURE, PROMPT_TYPE_SINGLE_MAGI, PROMPT_TYPE_NUMBER, PROMPT_TYPE_CHOOSE_N_CARDS_FROM_ZONE,
  ZONE_TYPE_ACTIVE_MAGI, ZONE_TYPE_IN_PLAY,
} from 'moonlands/dist/esm/const.js';
import { createZones } from '../simulationUtils.js';
import { HashBuilder } from '../HashBuilder.js';
import { GameState } from '../../GameState.js';
import { SimulationStrategy } from '../SimulationStrategy.js';
import { ReconSimulationStrategy } from '../ReconSimulationStrategy.js';

function wildFire() {
  const ring = new CardInGame(byName("Gorgle's Ring") as Card, 2);
  const cloud = new CardInGame(byName('Cloud Narth') as Card, 1).addEnergy(3);
  const base = new State({ zones: createZones(2, 1, [ring, cloud]), step: 1, activePlayer: 2 } as any);
  base.setPlayers(2, 1);
  base.initiatePRNG(1);
  base.getZone(ZONE_TYPE_ACTIVE_MAGI, 2).add([new CardInGame(byName('Barak') as Card, 2).addEnergy(7)]);
  base.getZone(ZONE_TYPE_ACTIVE_MAGI, 1).add([new CardInGame(byName('Ora') as Card, 1).addEnergy(18)]);
  const activate = (roll: number) => {
    const game = base.clone();
    game.setRollDebugValue(roll);
    const source = game.getZone(ZONE_TYPE_IN_PLAY).byId(ring.id)!;
    game.update({ type: ACTION_POWER, source, power: source.card.data.powers![0], player: 2 } as any);
    return game;
  };
  return { predicted: activate(5), actual: activate(6), cloudId: cloud.id };
}

describe('held prompt actions after a different Wild Fire die roll (triage run 0006)', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('distinguishes creature and Magi prompts from the same source without changing the battlefield', () => {
    const { predicted, actual } = wildFire();
    expect(predicted.state.promptType).toBe(PROMPT_TYPE_SINGLE_CREATURE);
    expect(actual.state.promptType).toBe(PROMPT_TYPE_SINGLE_MAGI);
    expect(predicted.state.promptGeneratedBy).toBe(actual.state.promptGeneratedBy);
    const builder = new HashBuilder();
    expect(builder.makeHash(predicted)).not.toBe(builder.makeHash(actual));
  });

  it.each([SimulationStrategy, ReconSimulationStrategy])('%p drops the creature reply and replans for a real Magi prompt', Strategy => {
    const { predicted, actual, cloudId } = wildFire();
    const live = new GameState(actual.serializeData(2) as any);
    live.setPlayerId(2);
    const strategy = new Strategy();
    strategy.setup(live, 2);
    const builder = (strategy as any).hashBuilder as HashBuilder;
    (strategy as any).actionsOnHold = [{
      action: { type: ACTION_RESOLVE_PROMPT, target: cloudId, targetName: 'Cloud Narth', player: 2 },
      hash: builder.makeHash(predicted),
    }, { action: { type: ACTION_PASS, player: 2 }, hash: 'obsolete continuation' }];
    const reply: any = strategy.requestAction();
    expect(reply.type).toBe(ACTION_RESOLVE_PROMPT);
    expect(reply.promptType).toBe(PROMPT_TYPE_SINGLE_MAGI);
    const magiIds = [1, 2].map(player => actual.getZone(ZONE_TYPE_ACTIVE_MAGI, player).card!.id);
    expect(magiIds).toContain(reply.target);
    expect(reply.target).not.toBe(cloudId);
    expect((strategy as any).actionsOnHold).toHaveLength(0);
  });

  it('includes prompt constraints while ignoring object key order and unavailable card details', () => {
    const { actual } = wildFire();
    const builder = new HashBuilder();
    actual.state.promptType = PROMPT_TYPE_NUMBER;
    actual.state.promptParams = { min: 1, max: 2 };
    const original = builder.makeHash(actual);
    actual.state.promptParams = { max: 2, min: 1 };
    expect(builder.makeHash(actual)).toBe(original);
    actual.state.promptParams = { min: 1, max: 3 };
    expect(builder.makeHash(actual)).not.toBe(original);
    actual.state.promptType = PROMPT_TYPE_CHOOSE_N_CARDS_FROM_ZONE;
    actual.state.promptParams = { cards: [{ id: 'one', card: 'Hidden search placeholder' }], numberOfCards: 1 } as any;
    const choices = builder.makeHash(actual);
    actual.state.promptParams = { numberOfCards: 1, cards: [{ id: 'one', card: 'Real card' }] } as any;
    expect(builder.makeHash(actual)).toBe(choices);
    actual.state.promptParams = { numberOfCards: 1, cards: [{ id: 'different' }] } as any;
    expect(builder.makeHash(actual)).not.toBe(choices);
  });
});
