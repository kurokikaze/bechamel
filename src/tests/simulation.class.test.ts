import { jest } from '@jest/globals';
import { Simulation, type SimulationResult } from './simulation.js';
import Card from 'moonlands/dist/esm/classes/Card.js';
import { cards } from 'moonlands/dist/esm/cards.js';
import { TYPE_CREATURE, TYPE_MAGI, REGION_NAROOM } from 'moonlands/dist/esm/const.js';

describe('Simulation class', () => {
    it.each(['simulation', 'recon'] as const)('runs a complete %s match through the legacy transport and shared session', strategy => {
        const definitions = [
            new Card('Session Test Magi A', TYPE_MAGI, REGION_NAROOM, null, { startingEnergy: 10, energize: 0, startingCards: ['Session Test Creature'] }),
            new Card('Session Test Magi B', TYPE_MAGI, REGION_NAROOM, null, { startingEnergy: 1, energize: 0, startingCards: ['Session Test Creature'] }),
            new Card('Session Test Creature', TYPE_CREATURE, REGION_NAROOM, 2, {}),
        ];
        cards.push(...definitions);
        const logs = ['log', 'dir', 'error', 'warn'].map(level => jest.spyOn(console, level as 'log').mockImplementation(() => {}));
        try {
            const result = new Simulation({ rng: 2053, strategy, maxIterations: 100,
                playerOne: { name: 'A', cards: ['Session Test Magi A', ...Array(4).fill('Session Test Creature')] },
                playerTwo: { name: 'B', cards: ['Session Test Magi B', ...Array(4).fill('Session Test Creature')] },
            }).run();
            expect(result.winner).toBe(1);
        } finally {
            logs.forEach(log => log.mockRestore());
            for (const card of definitions) cards.splice(cards.indexOf(card), 1);
        }
    });

    const buildSimulation = () => new Simulation({
        rng: 2053,
        writeLogs: false,
        playerOne: {
            name: 'Orothe Draft',
            cards: ['Whall'],
        },
        playerTwo: {
            name: 'Naroom Default',
            cards: ['Poad'],
        },
    });

    it('supports deck setup, run, and success subscription callbacks', () => {
        const simulation = buildSimulation();
        const result: SimulationResult = {
            winner: 1,
            winnerName: 'Orothe Draft',
            summary: {
                magiLeft: 1,
                energyLeft: 5,
                creaturesLeft: 0,
            },
            logs: {
                gameLog: [],
                playerOneLog: [],
                playerTwoLog: [],
            },
        };

        (simulation as any).execute = jest.fn(() => result);

        const next = jest.fn();
        const error = jest.fn();
        simulation.subscribe({ next, error });

        const runResult = simulation.run();

        expect(runResult).toEqual(result);
        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith(result);
        expect(error).not.toHaveBeenCalled();
    });

    it('supports error subscription callbacks', () => {
        const simulation = buildSimulation();
        const next = jest.fn();
        const error = jest.fn();
        const thrownError = new Error('boom');

        (simulation as any).execute = jest.fn(() => {
            throw thrownError;
        });

        simulation.subscribe({ next, error });

        expect(() => simulation.run()).toThrow('boom');

        expect(next).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledTimes(1);
        expect(error).toHaveBeenCalledWith(thrownError);
    });
});
