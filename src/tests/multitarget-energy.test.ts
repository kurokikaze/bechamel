import { GameState } from '../GameState.js';
import { createZones } from '../strategies/simulationUtils.js';
import { State } from 'moonlands/dist/esm/index.js';
import CardInGame from 'moonlands/dist/esm/classes/CardInGame.js';
import { byName } from 'moonlands/dist/esm/cards.js';
import { ZONE_TYPE_ACTIVE_MAGI } from 'moonlands/dist/esm/const.js';
import type { SerializedClientState } from '../types.js';

describe('Magi energy commands with multiple targets', () => {
  for (const effectType of ['effects/add_energy_to_magi', 'effects/remove_energy_from_magi']) {
    for (const count of [0, 1, 2]) {
      it(`${effectType} applies once to each of ${count} targets`, () => {
        const state = new State({ zones: createZones(1, 2, []), activePlayer: 1, step: 1 } as State['state']);
        state.setPlayers(1, 2);
        const targets = [new CardInGame(byName('Whall')!, 1).addEnergy(7), new CardInGame(byName('Motash')!, 2).addEnergy(5)];
        targets.forEach(card => state.getZone(ZONE_TYPE_ACTIVE_MAGI, card.owner).add([card]));
        const client = new GameState(state.serializeData(1, false) as unknown as SerializedClientState);
        client.setPlayerId(1);
        client.update({ type: 'actions/effect', effectType, target: targets.slice(0, count).map(card => ({ id: card.id })), amount: 2 } as any);
        const delta = effectType === 'effects/add_energy_to_magi' ? 2 : -2;
        expect([...client.state.zones.playerActiveMagi, ...client.state.zones.opponentActiveMagi].map(card => card.data.energy)).toEqual([7, 5].map((amount, index) => amount + (index < count ? delta : 0)));
      });
    }
  }
});
