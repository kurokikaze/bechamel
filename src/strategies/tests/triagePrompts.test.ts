import { jest } from '@jest/globals';
import { State } from 'moonlands/dist/esm/index.js';
import Card from 'moonlands/dist/esm/classes/Card.js';
import CardInGame from 'moonlands/dist/esm/classes/CardInGame.js';
import { byName } from 'moonlands/dist/esm/cards.js';
import convertClientCommands, { convertServerCommand } from 'duel-protocol/commands';
import {
  ACTION_ENTER_PROMPT, ACTION_POWER, ACTION_RESOLVE_PROMPT, ACTION_ATTACK, ACTION_PASS, ACTION_PLAY,
  PROMPT_TYPE_SINGLE_CREATURE, PROMPT_TYPE_SINGLE_CREATURE_FILTERED,
  PROMPT_TYPE_OWN_SINGLE_CREATURE, PROMPT_TYPE_ALTERNATIVE, PROMPT_TYPE_PLAYER,
  PROMPT_TYPE_MAGI_WITHOUT_CREATURES,
  PROMPT_TYPE_DISTRIBUTE_CARDS_IN_ZONES,
  ACTION_EFFECT, EFFECT_TYPE_PROMPT_ENTERED, PROMPT_TYPE_POWER_ON_MAGI,
  RESTRICTION_OPPONENT_CREATURE, RESTRICTION_ENERGY_LESS_THAN_STARTING,
  ZONE_TYPE_ACTIVE_MAGI, ZONE_TYPE_IN_PLAY, ZONE_TYPE_HAND, ZONE_TYPE_DECK, ZONE_TYPE_DISCARD,
} from 'moonlands/dist/esm/const.js';
import { createZones, createState, getStateScore } from '../simulationUtils.js';
import { ActionExtractor } from '../ActionExtractor.js';
import { DirectActionExtractor } from '../DirectActionExtractor.js';
import { HashBuilder } from '../HashBuilder.js';
import { GameState } from '../../GameState.js';
import { SimulationStrategy } from '../SimulationStrategy.js';
import { ReconSimulationStrategy } from '../ReconSimulationStrategy.js';
import UnexpectedPromptResolver from '../UnexpectedPromptResolver.js';

const strategies = [SimulationStrategy, ReconSimulationStrategy];
const strategyPlayers = strategies.flatMap(Strategy => [1, 2].map(player => [Strategy, player] as const));

function setup(player = 1, magiName = 'Grega', Strategy: typeof SimulationStrategy | typeof ReconSimulationStrategy = SimulationStrategy) {
  const card = (name: string, owner: number, energy = 0) => new CardInGame(byName(name) as Card, owner).addEnergy(energy);
  const crown = card("Arderial's Crown", player);
  const own = card('Arboll', player, 2);
  const enemyId = player === 1 ? 2 : 1;
  const enemy = card('Weebo', enemyId, 1);
  const grag = card('Fire Grag', player, 6);
  const game = new State({ zones: createZones(1, 2, [crown, own, enemy, grag]), activePlayer: player, step: 1 } as any);
  game.setPlayers(1, 2);
  for (const id of [1, 2]) game.getZone(ZONE_TYPE_ACTIVE_MAGI, id).add([card(id === player ? magiName : 'Grega', id, 10)]);
  const view = new GameState(game.serializeData(player) as any);
  view.setPlayerId(player);
  game.setOnAction(action => {
    const command = convertServerCommand(action, game, player);
    if (command) view.update(command);
  });
  const enter = (promptType: string, promptParams = {}) => game.update({ type: ACTION_ENTER_PROMPT, promptType, promptParams, player, generatedBy: crown.id } as any);
  const strategy = new Strategy();
  strategy.setup(view, player);
  const resolve = () => {
    const reply = strategy.requestAction();
    expect(reply.type).toBe(ACTION_RESOLVE_PROMPT);
    const converted = convertClientCommands(reply as any, game);
    expect(converted).not.toBeNull();
    game.update(converted!);
    return reply as any;
  };
  return { game, view, enter, resolve, own, enemy, crown, grag, strategy };
}

describe('triage batch prompt regressions', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it.each(strategies)('%p never selects a zero-energy relic for the Crown creature prompt (run 7)', Strategy => {
    const { game, enter, resolve, crown, enemy } = setup(1, 'Grega', Strategy);
    enter(PROMPT_TYPE_SINGLE_CREATURE);
    const reply = resolve();
    expect(reply.target).toBe(enemy.id);
    expect(reply.target).not.toBe(crown.id);
    expect(game.state.prompt).toBe(false);
  });

  it.each(strategyPlayers)('%p resolves both Metabolize prompts for player %i without leaving the engine behind', (Strategy, player) => {
    const { game, view, resolve, own, enemy, grag } = setup(player, 'Grega', Strategy);
    game.update({ type: ACTION_POWER, source: grag, power: grag.card.data.powers![0], player } as any);
    expect(game.state.promptType).toBe(PROMPT_TYPE_SINGLE_CREATURE_FILTERED);
    expect(resolve().target).toBe(own.id);
    expect(game.state.prompt).toBe(true);
    expect(view.state.prompt).toBe(true);
    expect(resolve().target).toBe(enemy.id);
    expect(game.state.prompt).toBe(false);
    expect(view.state.prompt).toBe(false);
  });

  it.each(strategies)('%p keeps singular energy restrictions when selecting a fallback target', Strategy => {
    const { game, enter, resolve, enemy } = setup(1, 'Grega', Strategy);
    enter(PROMPT_TYPE_SINGLE_CREATURE_FILTERED, { restriction: RESTRICTION_ENERGY_LESS_THAN_STARTING });
    expect(resolve().target).toBe(enemy.id);
    expect(game.state.prompt).toBe(false);
  });

  it('does not replace an empty legal target set with own creatures', () => {
    const { view, own } = setup();
    view.state.zones.inPlay = view.state.zones.inPlay.filter(card => card.id === own.id);
    view.state.prompt = true;
    view.state.promptType = PROMPT_TYPE_SINGLE_CREATURE_FILTERED;
    view.state.promptParams = { restrictions: [{ type: RESTRICTION_OPPONENT_CREATURE, value: 1 }] };
    expect(() => new UnexpectedPromptResolver().resolvePrompt(view)).toThrow(/No legal creature target/);
  });

  it.each(strategyPlayers)('%p limits own-creature prompts to the current player %i', (Strategy, player) => {
    const { enter, resolve, own, game } = setup(player, 'Grega', Strategy);
    enter(PROMPT_TYPE_OWN_SINGLE_CREATURE);
    expect(resolve().target).toBe(own.id);
    expect(game.state.prompt).toBe(false);
  });

  it.each(strategyPlayers)('%p resolves Gar tie-breaks with the protocol empty controller value for player %i', (Strategy, player) => {
    const { game, view, resolve, own, grag } = setup(player, 'Gar', Strategy);
    grag.data.energy = own.data.energy;
    // Set up both the real board and the client view before starting Draw.
    view.state.zones.inPlay.find(card => card.id === grag.id)!.data.energy = own.data.energy;
    game.state.step = 4;
    game.update({ type: ACTION_PASS, player });
    expect(game.state.promptType).toBe(PROMPT_TYPE_SINGLE_CREATURE_FILTERED);
    expect(view.state.promptParams.restrictions?.[0].value).toBe('');
    expect(resolve().target).toBe(own.id);
    expect(game.state.prompt).toBe(false);
  });

  it('preserves alternative values through the protocol and resolves using value, not number 0', () => {
    const { enter, view, resolve, game } = setup();
    const alternatives = [{ name: 'Discard the relic', value: 'discardRelic' }, { name: 'Discard energy', value: 'discardEnergy' }];
    enter(PROMPT_TYPE_ALTERNATIVE, { alternatives });
    expect(view.state.promptParams.alternatives).toEqual(alternatives);
    expect(resolve().alternative).toBe('discardRelic');
    expect(game.state.prompt).toBe(false);
  });

  it.each([1, 2])('resolves player prompts using an actual player ID (actor %i)', player => {
    const { enter, resolve, game } = setup(player);
    enter(PROMPT_TYPE_PLAYER);
    expect(resolve().targetPlayer).toBe(player === 1 ? 2 : 1);
    expect(game.state.prompt).toBe(false);
  });

  it.each([1, 2])('player %i takes a winning attack against an exposed Magi', player => {
    const opponent = player === 1 ? 2 : 1;
    const { game, own, enemy, grag } = setup(player);
    game.getZone(ZONE_TYPE_IN_PLAY).removeById(enemy.id);
    game.getZone(ZONE_TYPE_IN_PLAY).removeById(grag.id);
    game.getZone(ZONE_TYPE_ACTIVE_MAGI, opponent).card!.data.energy = 1;
    game.state.step = 2;
    const view = new GameState(game.serializeData(player) as any);
    view.setPlayerId(player);
    const strategy = new SimulationStrategy();
    strategy.setup(view, player);
    const sim = createState(view, player, opponent);
    expect(sim.getControllingPlayer()).toBe(player);
    expect(ActionExtractor.getAllAttackPatterns(sim, player, opponent)).toHaveLength(1);
    const before = getStateScore(sim, player, opponent);
    sim.update({ type: ACTION_ATTACK, source: sim.getZone(ZONE_TYPE_IN_PLAY).byId(own.id)!, target: sim.getZone(ZONE_TYPE_ACTIVE_MAGI, opponent).card!, player } as any);
    expect(getStateScore(sim, player, opponent)).toBeGreaterThan(before);
    expect(sim.hasWinner()).toBe(true);
    expect(ActionExtractor.extractActions(sim, player, opponent, [], 'terminal', new HashBuilder())).toEqual([]);
    expect(DirectActionExtractor.extractActions(sim, player, opponent)).toEqual([]);
    const reply: any = strategy.requestAction();
    expect(reply.type).toBe(ACTION_ATTACK);
    expect(reply.source).toBe(own.id);
  });

  it('keeps a paid Fog Bank in hand until its attachment prompt resolves (run 2 diagnostics)', () => {
    const { game, own } = setup(1, 'Ora');
    game.getZone(ZONE_TYPE_ACTIVE_MAGI, 1).card!.data.energy = 5;
    const fog = new CardInGame(byName('Fog Bank') as Card, 1);
    game.getZone(ZONE_TYPE_HAND, 1).add([fog]);
    const view = new GameState(game.serializeData(1) as any);
    view.setPlayerId(1);
    const sim = createState(view, 1, 2);
    const strategy = new SimulationStrategy();
    const source = sim.getZone(ZONE_TYPE_HAND, 1).byId(fog.id)!;
    sim.update({ type: ACTION_PLAY, payload: { card: source, player: 1 }, player: 1 } as any);
    expect(sim.state.prompt).toBe(true);
    expect(sim.getZone(ZONE_TYPE_ACTIVE_MAGI, 1).card!.data.energy).toBe(2);
    (strategy as any).trimHandToAffordable(sim, 1);
    expect(sim.getZone(ZONE_TYPE_HAND, 1).byId(fog.id)).not.toBeNull();
    sim.update({ type: ACTION_RESOLVE_PROMPT, target: sim.getZone(ZONE_TYPE_IN_PLAY).byId(own.id)!, player: 1 } as any);
    expect(sim.state.prompt).toBe(false);
    expect(sim.getZone(ZONE_TYPE_IN_PLAY).cards.some(card => card.card.name === 'Fog Bank')).toBe(true);
  });

  it.each([1, 2])('resolves Stab against the exposed Magi rather than the lower-energy defended Magi (actor %i)', player => {
    const { game, view, enemy, resolve } = setup(player, 'Whall');
    const opponent = player === 1 ? 2 : 1;
    game.getZone(ZONE_TYPE_IN_PLAY).removeById(enemy.id);
    view.state.zones.inPlay = view.state.zones.inPlay.filter(card => card.id !== enemy.id);
    game.getZone(ZONE_TYPE_ACTIVE_MAGI, player).card!.data.energy = 5;
    view.state.zones.playerActiveMagi[0].data.energy = 5;
    // Relics do not defend a Magi. Only creatures exclude it from this prompt.
    const relic = new CardInGame(byName('Orothean Belt') as Card, opponent);
    game.getZone(ZONE_TYPE_IN_PLAY).add([relic]);
    view.state.zones.inPlay.push(relic.serialize(false));
    const spear = new CardInGame(byName("Hubdra's Spear") as Card, player);
    game.getZone(ZONE_TYPE_IN_PLAY).add([spear]);
    view.state.zones.inPlay.push(spear.serialize(false));
    game.update({ type: ACTION_POWER, source: spear, power: spear.card.data.powers![0], player } as any);
    expect(game.state.promptType).toBe(PROMPT_TYPE_MAGI_WITHOUT_CREATURES);
    expect(resolve().target).toBe(game.getZone(ZONE_TYPE_ACTIVE_MAGI, opponent).card!.id);
    expect(game.state.prompt).toBe(false);
    expect(game.getZone(ZONE_TYPE_ACTIVE_MAGI, opponent).card!.data.energy).toBe(1);
    expect(game.getZone(ZONE_TYPE_ACTIVE_MAGI, player).card!.data.energy).toBe(1);
    expect(game.getZone(ZONE_TYPE_IN_PLAY).cards.map(card => card.id)).not.toContain(spear.id);
  });

  it('can select our own exposed Magi while the opponent has creatures', () => {
    const { game, view, enter, resolve, own, grag } = setup();
    for (const card of [own, grag]) game.getZone(ZONE_TYPE_IN_PLAY).removeById(card.id);
    view.state.zones.inPlay = view.state.zones.inPlay.filter(card => ![own.id, grag.id].includes(card.id));
    enter(PROMPT_TYPE_MAGI_WITHOUT_CREATURES);
    expect(resolve().target).toBe(game.getZone(ZONE_TYPE_ACTIVE_MAGI, 1).card!.id);
    expect(game.state.prompt).toBe(false);
  });

  it('reports an impossible Magi prompt rather than returning number:0', () => {
    const { view } = setup();
    view.state.prompt = true;
    view.state.promptType = PROMPT_TYPE_MAGI_WITHOUT_CREATURES;
    expect(() => new UnexpectedPromptResolver().resolvePrompt(view)).toThrow(/No legal Magi target/);
  });

  it('prefers the exposed opponent when both Magi have no creatures', () => {
    const { game, view, enter, resolve } = setup();
    game.getZone(ZONE_TYPE_IN_PLAY).empty();
    view.state.zones.inPlay = [];
    view.state.zones.playerActiveMagi[0].data.energy = 1;
    game.getZone(ZONE_TYPE_ACTIVE_MAGI, 1).card!.data.energy = 1;
    enter(PROMPT_TYPE_MAGI_WITHOUT_CREATURES);
    expect(resolve().target).toBe(game.getZone(ZONE_TYPE_ACTIVE_MAGI, 2).card!.id);
  });

  it('reports unsupported prompts instead of inventing a numeric reply', () => {
    const { view } = setup();
    view.state.prompt = true;
    view.state.promptType = 'prompt/not_supported' as any;
    expect(() => new UnexpectedPromptResolver().resolvePrompt(view)).toThrow(/no supported legal reply/);
  });

  it.each(strategyPlayers.flatMap(([Strategy, player]) => [0, 1, 2].map(count => [Strategy, player, count] as const)))('%p resolves Foresight for player %i with %i cards left', (Strategy, player, count) => {
    const { game, view, resolve } = setup(player, 'Whall', Strategy);
    const deck = game.getZone(ZONE_TYPE_DECK, player);
    const names = ['Colossus', 'Dream Balm'].slice(0, count);
    const cards = names.map(name => new CardInGame(byName(name) as Card, player));
    deck.add(cards);
    const goggles = new CardInGame(byName('Orothean Goggles') as Card, player);
    game.getZone(ZONE_TYPE_IN_PLAY).add([goggles]);
    view.state.zones.inPlay.push(goggles.serialize(false));
    game.update({ type: ACTION_POWER, source: goggles, power: goggles.card.data.powers![0], player } as any);
    expect(game.state.promptType).toBe(PROMPT_TYPE_DISTRIBUTE_CARDS_IN_ZONES);
    expect(view.state.promptParams.cards?.map(card => card.id)).toEqual(cards.map(card => card.id));
    expect(view.state.promptParams.sourceZoneOwner).toBe(player);
    const reply = resolve();
    expect(new Set(Object.values(reply.cards).flat())).toEqual(new Set(cards.map(card => card.id)));
    expect(game.state.prompt).toBe(false);
    expect(deck.cards.map(card => card.card.name).sort()).toEqual([...names].sort());
    expect(game.getZone(ZONE_TYPE_DISCARD, player).cards).toHaveLength(0);
  });

  it.each(strategyPlayers)('%p preserves a flat Magi prompt and chooses an affordable power for player %i', (Strategy, player) => {
    const { game, view, strategy, crown } = setup(player, 'Grega', Strategy);
    const magi = game.getZone(ZONE_TYPE_ACTIVE_MAGI, player).card!;
    const event = {
      type: ACTION_EFFECT, effectType: EFFECT_TYPE_PROMPT_ENTERED,
      promptType: PROMPT_TYPE_POWER_ON_MAGI, magi: magi.serialize(false),
      player, generatedBy: crown.id,
    };
    view.update(event);
    expect(view.state.promptParams.magi).toEqual(event.magi);
    const reply: any = strategy.requestAction();
    expect(reply.type).toBe(ACTION_RESOLVE_PROMPT);
    expect(reply.power).toBe(magi.card.data.powers![0].name);
    view.update({ ...event, magi: { ...event.magi, data: { ...event.magi.data, energy: 1 } } });
    expect(() => strategy.requestAction()).toThrow(/No affordable Magi power/);
  });
});
