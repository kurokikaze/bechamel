import { State } from 'moonlands/dist/esm/index.js';
import Card from 'moonlands/dist/esm/classes/Card.js';
import CardInGame from 'moonlands/dist/esm/classes/CardInGame.js';
import { byName } from 'moonlands/dist/esm/cards.js';
import { convertServerCommand } from 'duel-protocol/commands';
import * as C from 'moonlands/dist/esm/const.js';
import { GameState } from '../../GameState.js';
import { createZones } from '../simulationUtils.js';

describe('energy distribution client events', () => {
  it.each([1, 2])('keeps both bot views in sync after player %i uses Flame Hyren Energy Transfer', player => {
    const opponent = player === 1 ? 2 : 1;
    const card = (name: string, owner: number, energy: number) => new CardInGame(byName(name) as Card, owner).addEnergy(energy);
    const source = card('Flame Hyren', player, 9);
    const recipient = card('Flame Hyren', player, 1);
    const other = card('Weebo', opponent, 3);
    const untouched = card('Arbolit', player, 2);
    const game = new State({ zones: createZones(1, 2, [source, recipient, other, untouched]), activePlayer: player, step: 1 } as any);
    game.setPlayers(1, 2);
    for (const id of [1, 2]) game.getZone(C.ZONE_TYPE_ACTIVE_MAGI, id).add([card('Grega', id, 10)]);
    const views = [1, 2].map(id => {
      const view = new GameState(structuredClone(game.serializeData(id)) as any);
      view.setPlayerId(id);
      return view;
    });
    game.setOnAction(action => {
      views.forEach((view, index) => {
        const command = convertServerCommand(action, game, index + 1);
        if (command) view.update(command);
      });
    });
    game.update({ type: C.ACTION_POWER, source, power: source.card.data.powers![0], player } as any);
    expect(game.state.promptType).toBe(C.PROMPT_TYPE_DISTRIBUTE_ENERGY_ON_CREATURES);
    const before = views[0].state;
    game.update({ type: C.ACTION_RESOLVE_PROMPT, energyOnCreatures: { [recipient.id]: 7, [other.id]: 2, [untouched.id]: 0 }, player });
    expect(game.state.prompt).toBe(false);
    expect([recipient.data.energy, other.data.energy, untouched.data.energy]).toEqual([8, 5, 2]);
    for (const view of views) {
      expect(view.state.zones.inPlay.some(card => card.id === source.id)).toBe(false);
      for (const creature of [recipient, other, untouched]) {
        expect(view.state.zones.inPlay.find(card => card.id === creature.id)?.data.energy).toBe(creature.data.energy);
      }
      view.state.promptParams = { restrictions: [{ type: C.RESTRICTION_ENERGY_LESS_THAN, value: 5 }] };
      view.state.promptType = C.PROMPT_TYPE_SINGLE_CREATURE_FILTERED;
      expect(view.getCardsForFilteredPrompt().map(card => card.id)).toEqual([untouched.id]);
    }
    expect(before.zones.inPlay.find(card => card.id === recipient.id)?.data.energy).toBe(1);
  });
});
