import { byName } from 'moonlands/dist/cards';
import { State } from 'moonlands/dist';
import CardInGame from 'moonlands/dist/classes/CardInGame';
import Zone from 'moonlands/dist/classes/Zone';
import { ZONE_TYPE_HAND, ZONE_TYPE_DECK, ZONE_TYPE_DISCARD, ZONE_TYPE_ACTIVE_MAGI, ZONE_TYPE_MAGI_PILE, ZONE_TYPE_DEFEATED_MAGI, ZONE_TYPE_IN_PLAY, TYPE_CREATURE } from "../const";
export const booleanGuard = Boolean;
export const createZones = (player1, player2, creatures = [], activeMagi = []) => [
    new Zone('Player 1 hand', ZONE_TYPE_HAND, player1),
    new Zone('Player 2 hand', ZONE_TYPE_HAND, player2),
    new Zone('Player 1 deck', ZONE_TYPE_DECK, player1),
    new Zone('Player 2 deck', ZONE_TYPE_DECK, player2),
    new Zone('Player 1 discard', ZONE_TYPE_DISCARD, player1),
    new Zone('Player 2 discard', ZONE_TYPE_DISCARD, player2),
    new Zone('Player 1 active magi', ZONE_TYPE_ACTIVE_MAGI, player1).add(activeMagi),
    new Zone('Player 2 active magi', ZONE_TYPE_ACTIVE_MAGI, player2),
    new Zone('Player 1 Magi pile', ZONE_TYPE_MAGI_PILE, player1),
    new Zone('Player 2 Magi pile', ZONE_TYPE_MAGI_PILE, player2),
    new Zone('Player 1 defeated Magi', ZONE_TYPE_DEFEATED_MAGI, player1),
    new Zone('Player 2 defeated Magi', ZONE_TYPE_DEFEATED_MAGI, player2),
    new Zone('In play', ZONE_TYPE_IN_PLAY, null).add(creatures),
];
const defaultState = {
    actions: [],
    savedActions: [],
    delayedTriggers: [],
    mayEffectActions: [],
    fallbackActions: [],
    continuousEffects: [],
    activePlayer: 0,
    prompt: false,
    promptType: null,
    promptParams: {},
    log: [],
    step: 0,
    turn: 0,
    zones: [],
    players: [],
    spellMetaData: {},
};
export const STEP_ATTACK = 2;
export function createState(myCreatures, enemyCreatures, myMagi, opponentMagi, playerId, opponentId) {
    const myCreaturesCards = myCreatures.map(card => {
        const creatureCard = byName(card.card);
        if (!creatureCard) {
            return false;
        }
        const cardInGame = new CardInGame(creatureCard, playerId).addEnergy(card.data.energy);
        cardInGame.data.attacked = card.data.attacked;
        cardInGame.data.actionsUsed = [...card.data.actionsUsed];
        cardInGame.id = card.id;
        return cardInGame;
    }).filter(booleanGuard);
    const enemyCreaturesCards = enemyCreatures.map(card => {
        const creatureCard = byName(card.card);
        if (!creatureCard) {
            return false;
        }
        const cardInGame = new CardInGame(creatureCard, opponentId).addEnergy(card.data.energy);
        cardInGame.data.attacked = card.data.attacked;
        cardInGame.data.actionsUsed = [...card.data.actionsUsed];
        cardInGame.id = card.id;
        return cardInGame;
    }).filter(booleanGuard);
    const zones = createZones(playerId, opponentId, [...myCreaturesCards, ...enemyCreaturesCards], []);
    const sim = new State(Object.assign(Object.assign({}, defaultState), { zones, step: STEP_ATTACK, activePlayer: playerId, prompt: false, promptParams: {}, log: [] }));
    sim.setPlayers(playerId, opponentId);
    const myMagiActualCard = byName(myMagi === null || myMagi === void 0 ? void 0 : myMagi.card);
    if (myMagiActualCard) {
        const myMagiCard = new CardInGame(myMagiActualCard, playerId).addEnergy(myMagi.data.energy);
        myMagiCard.data.actionsUsed = [...myMagi.data.actionsUsed];
        myMagiCard.id = myMagi.id;
        sim.getZone(ZONE_TYPE_ACTIVE_MAGI, playerId).add([myMagiCard]);
    }
    const enemyMagiRealCard = byName(opponentMagi === null || opponentMagi === void 0 ? void 0 : opponentMagi.card);
    if (enemyMagiRealCard) {
        const enemyMagiCard = new CardInGame(enemyMagiRealCard, opponentId).addEnergy(opponentMagi.data.energy);
        enemyMagiCard.data.actionsUsed = [...myMagi.data.actionsUsed];
        enemyMagiCard.id = opponentMagi.id;
        sim.getZone(ZONE_TYPE_ACTIVE_MAGI, opponentId).add([enemyMagiCard]);
    }
    return sim;
}
export const CARD_SCORE = 0.1;
export const getStateScore = (state, attacker, opponent) => {
    let myScore = 0;
    let enemyScore = 0;
    const creatures = state.getZone(ZONE_TYPE_IN_PLAY).cards.filter((card) => card.card.type === TYPE_CREATURE);
    creatures.forEach((creature) => {
        if (creature.owner === attacker) {
            myScore += creature.data.energy + CARD_SCORE;
        }
        else {
            enemyScore += creature.data.energy + CARD_SCORE;
        }
    });
    const myMagi = state.getZone(ZONE_TYPE_ACTIVE_MAGI, attacker).card;
    if (myMagi) {
        myScore += myMagi.data.energy;
    }
    const enemyMagi = state.getZone(ZONE_TYPE_ACTIVE_MAGI, opponent).card;
    if (enemyMagi) {
        enemyScore += enemyMagi.data.energy;
    }
    if (state.hasWinner) {
        if (state.winner === opponent) {
            enemyScore += 1000;
        }
        else {
            myScore += 1000;
        }
    }
    return myScore - enemyScore;
};
