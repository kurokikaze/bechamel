import { jest } from '@jest/globals';
import { State } from 'moonlands/dist/esm/index.js';
import { ACTION_PASS, ACTION_RESOLVE_PROMPT, PROMPT_TYPE_MAY_ABILITY } from 'moonlands/dist/esm/const.js';
import { BotSession } from '../BotSession.js';
import { createZones } from '../strategies/simulationUtils.js';
import type { Strategy } from '../strategies/Strategy.js';
import { ErrorDumpService } from '../diagnostics.js';

function snapshot(overrides = {}) {
  const game = new State({ zones: createZones(1, 2), activePlayer: 2, step: 1 } as any);
  game.setPlayers(1, 2);
  return { ...game.serializeData(2), ...overrides } as any;
}

describe('BotSession action boundaries', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    [undefined, 'returned no action'],
    [{ type: ACTION_PASS, player: 2 }, 'non-prompt action'],
    [{ type: ACTION_RESOLVE_PROMPT, player: 1, useEffect: false }, 'action for player 1'],
  ])('reports and rejects an invalid prompt response: %j', (action, error) => {
    const report = jest.spyOn(ErrorDumpService, 'dumpActionFailure').mockReturnValue(undefined);
    const strategy = { setup: jest.fn(), requestAction: () => action } as unknown as Strategy;
    const session = new BotSession(strategy);
    expect(() => session.handleMessage({ type: 'special/setup', playerId: 2,
      state: snapshot({ prompt: true, promptPlayer: 2, promptType: PROMPT_TYPE_MAY_ABILITY }) })).toThrow(error);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][3]).toMatchObject({ location: 'BotSession', playerId: 2 });
  });

  it('does not hide strategy exceptions when diagnostic reporting also fails', () => {
    jest.spyOn(ErrorDumpService, 'dumpActionFailure').mockImplementation(() => { throw new Error('report failed'); });
    const strategy = { setup: jest.fn(), requestAction: () => { throw new Error('search failed'); } } as unknown as Strategy;
    expect(() => new BotSession(strategy).handleMessage({ type: 'special/setup', playerId: 2, state: snapshot() })).toThrow('search failed');
  });

  it('does not request actions after the game ends or on foreign priority', () => {
    const requestAction = jest.fn();
    const strategy = { setup: jest.fn(), requestAction } as unknown as Strategy;
    const session = new BotSession(strategy);
    expect(session.handleMessage({ type: 'special/setup', playerId: 2, state: snapshot({ gameEnded: true }) })).toBeNull();
    expect(session.handleMessage({ type: 'display/priority', player: 2 })).toBeNull();
    expect(session.handleMessage({ type: 'display/priority', player: 1 })).toBeNull();
    expect(requestAction).not.toHaveBeenCalled();
  });

  it('rejects an attempted prompt resolution during an ordinary step', () => {
    jest.spyOn(ErrorDumpService, 'dumpActionFailure').mockReturnValue(undefined);
    const strategy = { setup: jest.fn(), requestAction: () => ({ type: ACTION_RESOLVE_PROMPT, player: 2, useEffect: false }) } as unknown as Strategy;
    expect(() => new BotSession(strategy).handleMessage({ type: 'special/setup', playerId: 2, state: snapshot() })).toThrow('outside a prompt state');
  });
});
