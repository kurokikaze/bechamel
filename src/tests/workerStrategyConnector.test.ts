import { jest } from '@jest/globals';
import { State } from 'moonlands/dist/esm/index.js';
import Card from 'moonlands/dist/esm/classes/Card.js';
import CardInGame from 'moonlands/dist/esm/classes/CardInGame.js';
import { byName } from 'moonlands/dist/esm/cards.js';
import {
  ACTION_PASS, ACTION_POWER, ACTION_RESOLVE_PROMPT, ACTION_ENTER_PROMPT, PROMPT_TYPE_MAY_ABILITY,
  PROMPT_TYPE_CHOOSE_UP_TO_N_CARDS_FROM_ZONE,
  PROMPT_TYPE_SINGLE_CREATURE_FILTERED, RESTRICTION_OWN_CREATURE,
  ZONE_TYPE_ACTIVE_MAGI, ZONE_TYPE_DECK, ZONE_TYPE_HAND, ZONE_TYPE_DISCARD,
} from 'moonlands/dist/esm/const.js';
import convertClientCommands, { convertServerCommand } from 'duel-protocol/commands';
import { createZones } from '../strategies/simulationUtils.js';
import { SimulationStrategy } from '../strategies/SimulationStrategy.js';
import { WorkerStrategyConnector } from '../WorkerStrategyConnector.js';
import { BotSession } from '../BotSession.js';
import { StrategyConnector } from '../StrategyConnector.js';
import { Strategy } from '../strategies/Strategy.js';
import { C2SAction } from 'duel-protocol';

describe.each(['worker', 'headless', 'socket'])('%s strategy prompt dispatch', transport => {
  const connect = (strategy: Strategy) => {
    if (transport === 'worker') new WorkerStrategyConnector().connect(strategy);
    else if (transport === 'socket') {
      const handlers = new Map<string, (data: any) => void>();
      const connector = new StrategyConnector({
        on: (name: string, handler: (data: any) => void) => handlers.set(name, handler),
        emit: (_name: string, action: C2SAction) => (globalThis as any).postMessage(action),
        close: () => {},
      } as any);
      connector.connect(strategy);
      (globalThis as any).onmessage = ({ data }: any) => {
        if (data.type === 'special/setup') {
          handlers.get('gameData')!(data);
          connector.requestAndSendAction();
        } else handlers.get('action')!(data);
      };
    }
    else {
      const session = new BotSession(strategy);
      (globalThis as any).onmessage = ({ data }: any) => {
        const action = session.handleMessage(data);
        if (action) (globalThis as any).postMessage(action);
      };
    }
  };
  const originalOnMessage = Object.getOwnPropertyDescriptor(globalThis, 'onmessage');
  const originalPostMessage = Object.getOwnPropertyDescriptor(globalThis, 'postMessage');
  const receive = (data: unknown) => (globalThis as any).onmessage({ data });
  beforeEach(() => {
    (globalThis as any).onmessage = null;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'dir').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
    for (const [name, descriptor] of [['onmessage', originalOnMessage], ['postMessage', originalPostMessage]] as const) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as any)[name];
    }
  });

  it.each([0, 1, 2, 3])('answers Giant Vulbor Mind Shock outside its turn with %i cards in hand', handSize => {
    const card = (name: string, owner: number, energy = 0) => new CardInGame(byName(name) as Card, owner).addEnergy(energy);
    const vulbor = card('Giant Vulbor', 1, 4);
    const target = card('Corf', 2, 5);
    const game = new State({ zones: createZones(1, 2, [vulbor, target]), activePlayer: 1, step: 1 } as any);
    game.setPlayers(1, 2);
    for (const player of [1, 2]) game.getZone(ZONE_TYPE_ACTIVE_MAGI, player).add([card('Grega', player, 10)]);
    game.getZone(ZONE_TYPE_HAND, 2).add(Array.from({ length: handSize }, () => card('Parmalag', 2)));
    const pending: C2SAction[] = [];
    (globalThis as any).postMessage = (action: C2SAction) => pending.push(action);
    connect(new SimulationStrategy());
    receive({ type: 'special/setup', state: game.serializeData(2), playerId: 2 });
    game.setOnAction(action => {
      const command = convertServerCommand(action, game, 2);
      if (command) receive(command);
    });
    game.update({ type: ACTION_POWER, player: 1, source: vulbor, power: vulbor.card.data.powers![0] } as any);
    game.update({ type: ACTION_RESOLVE_PROMPT, player: 1, target, generatedBy: game.state.promptGeneratedBy } as any);
    if (handSize === 0) {
      // The engine skips the empty selection and immediately applies full damage.
      expect(game.state.prompt).toBe(false);
      expect(pending).toHaveLength(0);
      expect(target.data.energy).toBe(1);
      return;
    }
    expect(game.state.promptType).toBe(PROMPT_TYPE_CHOOSE_UP_TO_N_CARDS_FROM_ZONE);
    expect(game.state.promptPlayer).toBe(2);
    expect(pending).toHaveLength(0);
    // The engine worker sends priority after processing the human player's action.
    receive({ type: 'display/priority', player: 2 });
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ type: ACTION_RESOLVE_PROMPT,
      promptType: PROMPT_TYPE_CHOOSE_UP_TO_N_CARDS_FROM_ZONE, player: 2,
      zone: ZONE_TYPE_HAND, zoneOwner: 2 });
    const converted = convertClientCommands(pending[0] as any, game);
    expect(converted).toBeTruthy();
    game.update(converted!);
    const discarded = Math.min(2, handSize);
    expect(game.state.prompt).toBe(false);
    expect(game.state.activePlayer).toBe(1);
    expect(game.getZone(ZONE_TYPE_DISCARD, 2).length).toBe(discarded);
    expect(game.getZone(ZONE_TYPE_HAND, 2).length).toBe(handSize - discarded);
    expect(target.data.energy).toBe(5 - (4 - 2 * discarded));
  });

  it.each([false, true])('finishes Fossik Draw Step when useEffect=%s', useEffect => {
    const card = (name: string, owner: number, energy = 0) => new CardInGame(byName(name) as Card, owner).addEnergy(energy);
    const creature = card('Corf', 2, 3);
    const game = new State({ zones: createZones(1, 2, [creature]), activePlayer: 2, step: 4 } as any);
    game.setPlayers(1, 2);
    game.getZone(ZONE_TYPE_ACTIVE_MAGI, 1).add([card('Grega', 1, 10)]);
    game.getZone(ZONE_TYPE_ACTIVE_MAGI, 2).add([card('Fossik', 2, 10)]);
    game.getZone(ZONE_TYPE_DECK, 2).add([card('Parmalag', 2), card('Korrit', 2)]);
    game.update({ type: ACTION_PASS, player: 2 });
    expect(game.state.step).toBe(5);
    expect(game.state.promptType).toBe(PROMPT_TYPE_MAY_ABILITY);

    const pending: C2SAction[] = [];
    (globalThis as any).postMessage = (action: C2SAction) => pending.push(action);
    const strategy = new SimulationStrategy();
    // Also exercise accepting Strengthen and resolving its subsequent target prompt.
    if (useEffect) {
      const original = strategy.requestAction.bind(strategy);
      let first = true;
      jest.spyOn(strategy, 'requestAction').mockImplementation(() => {
        if (first) {
          first = false;
          return { type: ACTION_RESOLVE_PROMPT, useEffect: true, player: 2 };
        }
        return original();
      });
    }
    connect(strategy);
    game.setOnAction(action => {
      const command = convertServerCommand(action, game, 2);
      if (command) receive(command);
    });
    receive({ type: 'special/setup', state: game.serializeData(2), playerId: 2 });
    expect(pending).toHaveLength(1);
    for (let count = 0; pending.length && count < 4; count++) {
      const reply = pending.shift()!;
      expect(reply.type).toBe(ACTION_RESOLVE_PROMPT);
      const converted = convertClientCommands(reply as any, game);
      expect(converted).toBeTruthy();
      game.update(converted!);
      if (game.state.prompt) receive({ type: 'display/priority', player: 2 });
    }
    expect(game.state.prompt).toBe(false);
    expect(game.state.activePlayer).toBe(1);
    expect(game.getZone(ZONE_TYPE_HAND, 2).length).toBe(useEffect ? 1 : 2);
    expect(creature.data.energy).toBe(useEffect ? 6 : 3);
  });

  it.each([1, 2])('resolves a filtered creature prompt on Draw with active player %i', activePlayer => {
    const creature = new CardInGame(byName('Corf') as Card, 2).addEnergy(3);
    const game = new State({ zones: createZones(1, 2, [creature]), activePlayer, step: 5 } as any);
    game.setPlayers(1, 2);
    for (const player of [1, 2]) {
      game.getZone(ZONE_TYPE_ACTIVE_MAGI, player).add([new CardInGame(byName('Gar') as Card, player).addEnergy(10)]);
    }
    game.update({ type: ACTION_ENTER_PROMPT, player: 2, generatedBy: 'gar',
      promptType: PROMPT_TYPE_SINGLE_CREATURE_FILTERED,
      promptParams: { restriction: RESTRICTION_OWN_CREATURE } } as any);
    const pending: C2SAction[] = [];
    (globalThis as any).postMessage = (action: C2SAction) => pending.push(action);
    const strategy = new SimulationStrategy();
    const request = jest.spyOn(strategy, 'requestAction');
    connect(strategy);
    receive({ type: 'special/setup', state: game.serializeData(2), playerId: 2 });
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ type: ACTION_RESOLVE_PROMPT, target: creature.id, player: 2 });
    game.update(convertClientCommands(pending[0] as any, game)!);
    expect(game.state.prompt).toBe(false);

    // A finished Draw Step and another player's prompt must not trigger bot actions.
    const snapshot = game.serializeData(2);
    request.mockClear();
    receive({ type: 'special/setup', state: snapshot, playerId: 2 });
    receive({ type: 'display/priority', player: 2 });
    expect(request).not.toHaveBeenCalled();
    receive({ type: 'special/setup', state: { ...snapshot, step: 1, activePlayer: 2,
      prompt: true, promptPlayer: 1, promptType: PROMPT_TYPE_MAY_ABILITY }, playerId: 2 });
    receive({ type: 'display/priority', player: 2 });
    expect(request).not.toHaveBeenCalled();
  });
});
