import { jest } from '@jest/globals';
import { State } from 'moonlands/dist/esm/index.js';
import Card from 'moonlands/dist/esm/classes/Card.js';
import CardInGame from 'moonlands/dist/esm/classes/CardInGame.js';
import { byName } from 'moonlands/dist/esm/cards.js';
import * as C from 'moonlands/dist/esm/const.js';
import convertClientCommands, { convertServerCommand } from 'duel-protocol/commands';
import { GameState } from '../../GameState.js';
import { SimulationStrategy } from '../SimulationStrategy.js';
import { ReconSimulationStrategy } from '../ReconSimulationStrategy.js';
import { createZones, createState, getStateScore } from '../simulationUtils.js';
import { ActionExtractor } from '../ActionExtractor.js';
import { DirectActionExtractor } from '../DirectActionExtractor.js';
import { HashBuilder } from '../HashBuilder.js';
import { attackControlValue } from '../attackControlValue.js';

const strategies = [SimulationStrategy, ReconSimulationStrategy];
const cases = strategies.flatMap(Strategy => [1, 2].map(player => [Strategy, player] as const));

function setup(player: number, withBwill = true, active = true) {
  const opponent = player === 1 ? 2 : 1;
  const card = (name: string, owner: number, energy: number) => new CardInGame(byName(name) as Card, owner).addEnergy(energy);
  const bwill = card('Bwill', player, 1);
  const strong = card('Colossus', opponent, 20);
  const weak = card('Arbolit', opponent, 3);
  const definition = byName('Will of Orothe')!.data.effects!.find((effect: any) =>
    effect.staticAbilities?.some((ability: any) => ability.property === C.PROPERTY_CONTROLLING_PLAYER)) as any;
  const effect = { ...definition, generatedBy: 'will', player, id: 'will',
    expiration: { ...definition.expiration, active, turnPlayer: opponent },
    staticAbilities: definition.staticAbilities.map((ability: any) => ({ ...ability, selectorParameter: opponent, modifier: { ...ability.modifier, operandOne: player } })),
  };
  const game = new State({ zones: createZones(player, opponent, [...(withBwill ? [bwill] : []), strong, weak]),
    step: 2, activePlayer: opponent, controllingPlayer: opponent, continuousEffects: [effect] } as any);
  game.setPlayers(player, opponent);
  game.getZone(C.ZONE_TYPE_ACTIVE_MAGI, player).add([card('Whall', player, 10)]);
  game.getZone(C.ZONE_TYPE_ACTIVE_MAGI, opponent).add([card('Grega', opponent, 10)]);
  const view = new GameState(structuredClone(game.serializeData(player)) as any);
  view.setPlayerId(player);
  game.setOnAction(action => {
    const command = convertServerCommand(action, game, player);
    if (command) view.update(command);
  });
  return { game, view, player, opponent, bwill, strong, weak, card };
}

describe('Will of Orothe bot control', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it.each(cases)('%p player %i sacrifices the strongest enemy into Bwill, then passes', (Strategy, player) => {
    const { game, view, opponent, bwill, strong } = setup(player);
    const sim = createState(view, player, opponent);
    expect(sim.state.activePlayer).toBe(opponent);
    expect(sim.getControllingPlayer()).toBe(player);
    expect(view.playerPriority(player)).toBe(true);
    expect(view.playerPriority(opponent)).toBe(false);
    const bot = new Strategy(); bot.setup(view, player);
    const action: any = bot.requestAction();
    expect(action).toMatchObject({ type: C.ACTION_ATTACK, source: strong.id, target: bwill.id, player });
    game.update(convertClientCommands(action, game)!);
    expect(game.getZone(C.ZONE_TYPE_IN_PLAY).containsId(strong.id)).toBe(false);
    expect(game.getZone(C.ZONE_TYPE_IN_PLAY).containsId(bwill.id)).toBe(false);
    const pass: any = bot.requestAction();
    expect(pass).toMatchObject({ type: C.ACTION_PASS, player });
    game.update(convertClientCommands(pass, game)!);
    expect(game.state.step).toBe(3);
    expect(game.getControllingPlayer()).toBe(opponent);
    expect(view.playerPriority(player)).toBe(false);
  });

  it.each(cases)('%p player %i passes instead of damaging its own Magi', (Strategy, player) => {
    const { game, view } = setup(player, false);
    const bot = new Strategy(); bot.setup(view, player);
    const action: any = bot.requestAction();
    expect(action).toMatchObject({ type: C.ACTION_PASS, player });
    game.update(convertClientCommands(action, game)!);
    expect(game.state.step).toBe(3);
  });

  it('extracts attacks against the caster Magi, applies them by ID and stops after passing', () => {
    const { game, player, opponent } = setup(1, false);
    const attacks = DirectActionExtractor.extractActions(game, player, opponent).filter(action => action.type === 'ATTACK');
    expect(attacks.length).toBeGreaterThan(0);
    const magi = game.getZone(C.ZONE_TYPE_ACTIVE_MAGI, player).card!;
    expect(attacks.every(action => action.type === 'ATTACK' && action.targetId === magi.id)).toBe(true);
    const frame = game.beginSearchFrame();
    DirectActionExtractor.applyAction(game, attacks[0], player, opponent);
    expect(magi.data.energy).toBeLessThan(10);
    game.rollback(frame);
    DirectActionExtractor.applyAction(game, { type: 'PASS' }, player, opponent);
    expect(DirectActionExtractor.extractActions(game, player, opponent)).toEqual([]);
    expect(ActionExtractor.extractActions(game, player, opponent, [], '', new HashBuilder())).toEqual([]);
  });

  it('values the future Bwill combination, without reusing the forecast during actual attacks', () => {
    const { game } = setup(1);
    expect(attackControlValue(game, 1)).toBe(0);
    (game.state.continuousEffects[0].expiration as any).active = false;
    game.setStep(1);
    expect(attackControlValue(game, 1)).toBeGreaterThan(6);
    expect(attackControlValue(game, 2)).toBe(-attackControlValue(game, 1));
    game.state.continuousEffects = [];
    expect(attackControlValue(game, 1)).toBe(0);
  });

  it.each(cases)('%p player %i chooses to cast Will when Bwill can remove a large enemy', (Strategy, player) => {
    const { game, opponent, card } = setup(player);
    game.state.continuousEffects = [];
    game.setActivePlayer(player);
    game.setStep(1);
    const magi = game.getZone(C.ZONE_TYPE_ACTIVE_MAGI, player).card!;
    magi.data.energy = 6;
    magi.data.actionsUsed = magi.card.data.powers!.map(power => power.name);
    const will = card('Will of Orothe', player, 0);
    game.getZone(C.ZONE_TYPE_HAND, player).add([will]);
    const view = new GameState(structuredClone(game.serializeData(player)) as any); view.setPlayerId(player);
    game.setOnAction(action => {
      const command = convertServerCommand(action, game, player);
      if (command) view.update(command);
    });
    const bot = new Strategy(); bot.setup(view, player);
    const scoreBefore = getStateScore(game, player, opponent);
    const action: any = bot.requestAction();
    expect(action).toMatchObject({ type: C.ACTION_PLAY, payload: { card: { id: will.id } } });
    game.update(convertClientCommands(action, game)!);
    expect(game.state.promptType).toBe(C.PROMPT_TYPE_PLAYER);
    const target: any = bot.requestAction();
    expect(target).toMatchObject({ type: C.ACTION_RESOLVE_PROMPT, targetPlayer: opponent });
    game.update(convertClientCommands(target, game)!);
    expect(game.state.prompt).toBe(false);
    expect(attackControlValue(game, player)).toBeGreaterThan(6);
    expect(getStateScore(game, player, opponent)).toBeGreaterThan(scoreBefore);
  });

  it('distinguishes a pending control effect in search hashes', () => {
    const { game } = setup(1, true, false);
    const builder = new HashBuilder();
    const withEffect = builder.makeHash(game);
    game.state.continuousEffects = [];
    expect(builder.makeHash(game)).not.toBe(withEffect);
  });

  it.each(cases)('%p player %i respects mandatory attacks even when passing would be better', (Strategy, player) => {
    const { game, strong } = setup(player, false);
    game.state.continuousEffects.push({
      generatedBy: 'required', player, expiration: { type: C.EXPIRATION_NEVER },
      staticAbilities: [{ name: 'Required attack', text: '', selector: C.SELECTOR_ID, selectorParameter: strong.id,
        property: C.PROPERTY_MUST_ATTACK, modifier: { operator: C.CALCULATION_SET, operandOne: true } }],
    } as any);
    const view = new GameState(structuredClone(game.serializeData(player)) as any); view.setPlayerId(player);
    game.setOnAction(action => {
      const command = convertServerCommand(action, game, player);
      if (command) view.update(command);
    });
    const bot = new Strategy(); bot.setup(view, player);
    for (let attempts = 0; attempts < 3 && !strong.data.hasAttacked; attempts++) {
      const action: any = bot.requestAction();
      expect(action).toMatchObject({ type: C.ACTION_ATTACK, player });
      game.update(convertClientCommands(action, game)!);
    }
    expect(strong.data.hasAttacked).toBe(true);
  });
});
