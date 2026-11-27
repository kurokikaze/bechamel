import { jest } from '@jest/globals';
import { State } from 'moonlands/dist/esm/index.js';
import CardInGame from 'moonlands/dist/esm/classes/CardInGame.js';
import Zone from 'moonlands/dist/esm/classes/Zone.js';
import { byName } from 'moonlands/dist/esm/cards.js';
import { ACTION_PLAY, ZONE_TYPE_HAND, ZONE_TYPE_IN_PLAY, ZONE_TYPE_ACTIVE_MAGI, ZONE_TYPE_SET_ASIDE } from 'moonlands/dist/esm/const.js';
import { createZones } from '../simulationUtils.js';
import { GameState } from '../../GameState.js';
import { SimulationStrategy } from '../SimulationStrategy.js';
import { ReconSimulationStrategy } from '../ReconSimulationStrategy.js';

function setup(player: number) {
  const opponent = player === 1 ? 2 : 1;
  const card = (name: string, owner: number, energy = 0) => new CardInGame(byName(name)!, owner).addEnergy(energy);
  const karak = card('Karak', opponent, 5);
  karak.setActionUsed('Steal');
  const locked = card('Water of Life', player);
  locked.data.setAsideUnder = { cardId: karak.id, blockedPlayer: player };
  const candidate = card('Water of Life', player);
  const game = new State({ zones: [...createZones(1, 2, [karak]), new Zone('Set aside', ZONE_TYPE_SET_ASIDE, null).add([locked])],
    activePlayer: player, step: 1 } as any);
  game.setPlayers(1, 2);
  game.getZone(ZONE_TYPE_ACTIVE_MAGI, player).add([card('Evu', player, 10)]);
  game.getZone(ZONE_TYPE_ACTIVE_MAGI, opponent).add([card('Evu', opponent, 10)]);
  game.getZone(ZONE_TYPE_HAND, player).add([candidate]);
  const view = () => {
    const state = new GameState(game.serializeData(player) as any);
    state.setPlayerId(player);
    return state;
  };
  return { game, view, locked, candidate, karak };
}

describe('Karak prevents replaying a locked relic (batch 5deb, run 387)', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([1, 2].flatMap(player => [SimulationStrategy, ReconSimulationStrategy].map(Strategy => [player, Strategy] as const)))(
    'player %i / %p does not try to play the blocked relic again', (player, Strategy) => {
      const { view, candidate } = setup(player);
      const state = view();
      expect(state.getPlayableCards().map(card => card.id)).not.toContain(candidate.id);
      const strategy = new Strategy();
      strategy.setup(state, player);
      expect(strategy.requestAction()).not.toMatchObject({ type: ACTION_PLAY, payload: { card: { id: candidate.id } } });
    },
  );

  it('releases the lock when Karak leaves play and does not block the other player', () => {
    const { game, view, candidate, locked, karak } = setup(1);
    locked.data.setAsideUnder!.blockedPlayer = 2;
    expect(view().getPlayableCards().map(card => card.id)).toContain(candidate.id);
    locked.data.setAsideUnder!.blockedPlayer = 1;
    game.getZone(ZONE_TYPE_IN_PLAY).removeById(karak.id);
    expect(view().getPlayableCards().map(card => card.id)).toContain(candidate.id);
  });
});
