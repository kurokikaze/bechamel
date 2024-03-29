import { byName } from 'moonlands/dist/cards';
import CardInGame from 'moonlands/dist/classes/CardInGame';
import { PROMPT_TYPE_MAY_ABILITY, ZONE_TYPE_HAND, ACTION_ATTACK, ACTION_PASS, ACTION_PLAY, ACTION_POWER, ACTION_RESOLVE_PROMPT, PROMPT_TYPE_CHOOSE_CARDS, TYPE_CREATURE, TYPE_RELIC, ZONE_TYPE_MAGI_PILE, } from "../const";
import { createState, getStateScore } from './simulationUtils';
import { HashBuilder } from './HashBuilder';
import { ActionExtractor } from './ActionExtractor';
const STEP_NAME = {
    ENERGIZE: 0,
    PRS1: 1,
    ATTACK: 2,
    CREATURES: 3,
    PRS2: 4,
    DRAW: 5,
};
const addCardData = (card) => (Object.assign(Object.assign({}, card), { _card: byName(card.card) }));
export class SimulationStrategy {
    constructor() {
        this.leaves = new Map();
        this.graph = '';
        this.actionsOnHold = [];
        this.StoredTree = [];
        this.hashBuilder = new HashBuilder();
    }
    setup(state, playerId) {
        this.gameState = state;
        this.playerId = playerId;
    }
    pass() {
        return {
            type: ACTION_PASS,
            player: this.playerId,
        };
    }
    play(cardId) {
        return {
            type: ACTION_PLAY,
            payload: {
                card: cardId,
                player: this.playerId,
            }
        };
    }
    attack(from, to, add) {
        return add ? {
            type: ACTION_ATTACK,
            source: from,
            additionalAttackers: [add],
            target: to,
            player: this.playerId,
        } : {
            type: ACTION_ATTACK,
            source: from,
            target: to,
            player: this.playerId,
        };
    }
    power(source, power) {
        return {
            type: ACTION_POWER,
            source,
            power,
            player: this.playerId,
        };
    }
    resolveTargetPrompt(target, type) {
        var _a;
        return {
            type: ACTION_RESOLVE_PROMPT,
            promptType: type || ((_a = this.gameState) === null || _a === void 0 ? void 0 : _a.getPromptType()),
            target,
            player: this.playerId,
        };
    }
    resolveNumberPrompt(number, type) {
        var _a;
        return {
            type: ACTION_RESOLVE_PROMPT,
            promptType: type || ((_a = this.gameState) === null || _a === void 0 ? void 0 : _a.getPromptType()),
            number,
            player: this.playerId,
        };
    }
    simulationActionToClientAction(simAction) {
        var _a;
        switch (simAction.type) {
            case ACTION_PLAY: {
                return this.play(simAction.payload.card.id);
            }
            case ACTION_POWER: {
                return this.power(simAction.source.id, simAction.power.name);
            }
            case ACTION_ATTACK: {
                const add = simAction.additionalAttackers ? (_a = simAction.additionalAttackers[0]) === null || _a === void 0 ? void 0 : _a.id : '';
                return this.attack(simAction.source.id, simAction.target.id, add);
            }
            case ACTION_RESOLVE_PROMPT: {
                if (simAction.target) {
                    return this.resolveTargetPrompt(simAction.target.id, simAction.promptType);
                }
                if (simAction.number) {
                    return this.resolveNumberPrompt(simAction.number, simAction.promptType);
                }
                console.log('No transformer for ACTION_RESOLVE_PROMPT action');
                console.dir(simAction);
                break;
            }
            case ACTION_PASS: {
                return this.pass();
            }
            default: {
                console.log('No transformer for sim action');
                console.dir(simAction);
                break;
            }
        }
    }
    simulateAttacksQueue(simulationQueue, initialScore, opponentId) {
        const hashes = new Set();
        let bestAction = {
            score: initialScore,
            action: [this.pass()]
        };
        if (!this.playerId) {
            return this.pass();
        }
        // Simulation itself
        let failsafe = SimulationStrategy.failsafe;
        let counter = 0;
        while (simulationQueue.length && failsafe > 0) {
            failsafe -= 1;
            counter += 1;
            const workEntity = simulationQueue.pop();
            if (workEntity) {
                try {
                    workEntity.sim.update(workEntity.action);
                }
                catch (e) {
                    console.log('Error applying action');
                    console.dir(e);
                    console.dir(workEntity);
                }
                const score = getStateScore(workEntity.sim, this.playerId, opponentId);
                if (score > bestAction.score) {
                    bestAction.score = score;
                    bestAction.action = (workEntity === null || workEntity === void 0 ? void 0 : workEntity.actionLog) || [];
                }
                const hash = this.hashBuilder.makeHash(workEntity.sim);
                if (hashes.has(hash)) {
                    continue;
                }
                hashes.add(hash);
                simulationQueue.push(...ActionExtractor.extractActions(workEntity.sim, this.playerId, opponentId, workEntity.actionLog, hash));
            }
        }
        console.log(`Done ${counter} attack simulations`);
        console.log(`Best found score is ${bestAction.score} (initial is ${initialScore})`);
        console.log('Actions corresponding to the score: ');
        console.log(JSON.stringify(bestAction.action));
        return bestAction.action[0];
    }
    actionToLabel(action) {
        switch (action.type) {
            case ACTION_PLAY: {
                return `PLAY ${action.payload.card.card.name}`;
            }
            case ACTION_POWER: {
                return `POWER ${action.source.card.name} ${action.power.name}`;
            }
            case ACTION_RESOLVE_PROMPT: {
                return `RESOLVE_PROMPT ${action.target.card.name || action.number}`;
            }
            case ACTION_ATTACK: {
                return `ATTACK ${action.source.card.name} -> ${action.target.card.name}`;
            }
            case ACTION_PASS: {
                return 'PASS';
            }
        }
        return `Unknown action: ${action.type}`;
    }
    simulateActionsQueue(simulationQueue, initialScore, opponentId) {
        const hashes = new Set();
        if (!this.playerId) {
            return [this.pass()];
        }
        // Simulation itself
        let counter = 0;
        this.leaves.clear();
        while (simulationQueue.length && counter <= SimulationStrategy.failsafe) {
            counter += 1;
            const workEntity = simulationQueue.shift();
            if (workEntity && workEntity.action) {
                try {
                    workEntity.sim.update(workEntity.action);
                }
                catch (e) {
                    console.log('Error applying action');
                    console.log(`Message: ${e.message}`);
                    console.dir(workEntity.action);
                }
                const score = getStateScore(workEntity.sim, this.playerId, opponentId);
                const hash = this.hashBuilder.makeHash(workEntity.sim);
                // try {
                //   this.graph = this.graph + `  "${workEntity.previousHash}" -> "${hash}" [label="${this.actionToLabel(workEntity.action)}"]\n`
                // } catch (_e) {}
                if (hashes.has(hash)) {
                    continue;
                }
                hashes.add(hash);
                this.leaves.delete(workEntity.previousHash);
                this.leaves.set(hash, {
                    hash,
                    parentHash: hash,
                    score,
                    actionLog: workEntity.actionLog,
                    isPrompt: Boolean(workEntity.sim.state.prompt),
                });
                simulationQueue.push(...ActionExtractor.extractActions(workEntity.sim, this.playerId, opponentId, workEntity.actionLog, hash));
            }
        }
        let bestAction = {
            score: initialScore,
            action: []
        };
        this.leaves.forEach((value) => {
            if (!value.isPrompt && (value.score > bestAction.score) || (value.score == bestAction.score && value.actionLog.length < bestAction.action.length)) {
                bestAction.score = value.score;
                bestAction.action = value.actionLog;
            }
        });
        // console.log(`
        // digraph sim {
        //   ${this.graph}
        // }
        // `)
        console.log(`Done ${counter} power simulations. Leaves reached: ${this.leaves.size}`);
        console.log(`Best found score is ${bestAction.score} (initial is ${initialScore})`);
        return bestAction.action;
    }
    shouldClearHeldActions() {
        if (!this.actionsOnHold.length)
            return false;
        const action = this.actionsOnHold[0];
        if (this.gameState.getStep() === STEP_NAME.CREATURES) {
            const playableCards = this.gameState.getPlayableCards();
            const ids = new Set(playableCards.map(({ id }) => id));
            if (action.type === ACTION_PLAY &&
                !ids.has(action.payload.card)) {
                console.log(`Failed summon, passing. Dropping ${this.actionsOnHold.length} actions on hold.`);
                return true;
            }
        }
        else if (this.gameState.getStep() === STEP_NAME.PRS1 || this.gameState.getStep() === STEP_NAME.PRS2) {
            const creaturesRelicsAndMagi = [
                ...this.gameState.getMyCreaturesInPlay(),
                ...this.gameState.getMyRelicsInPlay(),
            ];
            const myMagi = this.gameState.getMyMagi();
            if (myMagi) {
                creaturesRelicsAndMagi.push(myMagi);
            }
            const ids = new Set(creaturesRelicsAndMagi.map(({ id }) => id));
            if (action.type === ACTION_POWER &&
                !ids.has(action.source)) {
                console.log(`Failed power activation, no card with id ${action.source} (power to be activated is ${action.power}). Dropping ${this.actionsOnHold.length} actions on hold.`);
                this.actionsOnHold = [];
                return true;
            }
        }
        else if (this.gameState.getStep() === STEP_NAME.ATTACK) {
            if (!(action.type === ACTION_PASS || action.type === ACTION_ATTACK)) {
                console.log('Non-attack action in the attack step');
                return true;
            }
        }
        return false;
    }
    requestAction() {
        if (this.shouldClearHeldActions()) {
            this.actionsOnHold = [];
        }
        if (this.actionsOnHold.length) {
            const action = this.actionsOnHold.shift();
            // If we are passing at the creatures step, clear the actions on hold
            if (action.type === ACTION_PASS && this.gameState.getStep() === STEP_NAME.CREATURES) {
                this.actionsOnHold = [];
            }
            return action;
        }
        if (this.gameState && this.playerId) {
            if (this.gameState.waitingForCardSelection()) {
                return {
                    type: ACTION_RESOLVE_PROMPT,
                    promptType: PROMPT_TYPE_CHOOSE_CARDS,
                    cards: this.gameState.getStartingCards(),
                    player: this.playerId,
                };
            }
            if (this.gameState.isInPromptState && this.gameState.getPromptType() === PROMPT_TYPE_MAY_ABILITY) {
                return {
                    type: ACTION_RESOLVE_PROMPT,
                    promptType: PROMPT_TYPE_MAY_ABILITY,
                    useEffect: false,
                    player: this.playerId,
                };
            }
            if (this.waitingTarget && this.gameState.waitingForTarget(this.waitingTarget.source, this.playerId)) {
                return this.resolveTargetPrompt(this.waitingTarget.target);
            }
            if (this.gameState.playerPriority(this.playerId)) {
                const step = this.gameState.getStep();
                switch (step) {
                    case STEP_NAME.PRS1:
                    case STEP_NAME.PRS2: {
                        const playable = this.gameState.getPlayableCards()
                            .map(addCardData)
                            .filter((card) => card._card.type === TYPE_RELIC);
                        const relics = this.gameState.getMyRelicsInPlay().map(card => { var _a; return (_a = card._card) === null || _a === void 0 ? void 0 : _a.name; });
                        if (playable.some(card => !relics.includes(card._card.name))) {
                            const playableRelic = playable.find(card => !relics.includes(card._card.name));
                            if (playableRelic) {
                                return this.play(playableRelic === null || playableRelic === void 0 ? void 0 : playableRelic.id);
                            }
                        }
                        const TEMPORARY_OPPONENT_ID = this.playerId + 1;
                        const myMagi = this.gameState.getMyMagi();
                        const myCreatures = this.gameState.getMyCreaturesInPlay();
                        const myMagiPile = this.gameState.getMyMagiPile();
                        const myRelics = this.gameState.getMyRelicsInPlay();
                        const opponentMagi = this.gameState.getOpponentMagi();
                        const enemyCreatures = this.gameState.getEnemyCreaturesInPlay();
                        const enemyRelics = this.gameState.getEnemyRelicsInPlay();
                        const outerSim = createState([...myCreatures, ...myRelics], [...enemyCreatures, ...enemyRelics], myMagi, opponentMagi, this.playerId || 1, TEMPORARY_OPPONENT_ID);
                        outerSim.state.step = this.gameState.getStep();
                        // All relics are played as soon as they are available
                        // No point in waiting really
                        const playableEnrichedCards = this.gameState.getPlayableCards()
                            .map(addCardData).filter(card => card._card.type !== TYPE_RELIC);
                        outerSim.getZone(ZONE_TYPE_HAND, this.playerId).add(playableEnrichedCards.map(card => {
                            const gameCard = new CardInGame(byName(card.card), this.playerId);
                            gameCard.id = card.id;
                            return gameCard;
                        }));
                        outerSim.getZone(ZONE_TYPE_MAGI_PILE, this.playerId).add(myMagiPile.map(magi => {
                            const card = new CardInGame(byName(magi.card), this.playerId);
                            card.id = magi.id;
                            return card;
                        }));
                        const hash = this.hashBuilder.makeHash(outerSim);
                        const initialScore = getStateScore(outerSim, this.playerId, TEMPORARY_OPPONENT_ID);
                        const simulationQueue = ActionExtractor.extractActions(outerSim, this.playerId, TEMPORARY_OPPONENT_ID, [], hash);
                        const bestActions = this.simulateActionsQueue(simulationQueue, initialScore, TEMPORARY_OPPONENT_ID);
                        const finalHash = this.hashBuilder.makeHash(outerSim);
                        if (finalHash !== hash) {
                            console.log(`Change leak! hashes mismatch: ${hash} => ${finalHash}`);
                        }
                        if (!bestActions[0]) {
                            return this.pass();
                        }
                        this.actionsOnHold = bestActions.slice(1).map(action => this.simulationActionToClientAction(action));
                        if (this.actionsOnHold.length) {
                            console.log(`Stored ${this.actionsOnHold.length} actions on hold`);
                            // console.dir(this.actionsOnHold)
                        }
                        const bestAction = bestActions[0];
                        console.log('Chosen action:');
                        console.log(JSON.stringify(bestAction, null, 2));
                        return this.simulationActionToClientAction(bestAction);
                    }
                    case STEP_NAME.CREATURES: {
                        const myMagiCard = this.gameState.getMyMagi();
                        if (!myMagiCard) {
                            return this.pass();
                        }
                        const myMagi = Object.assign(Object.assign({}, myMagiCard), { _card: byName(myMagiCard.card) });
                        const availableEnergy = myMagi.data.energy;
                        const playable = this.gameState.getPlayableCards()
                            .map(addCardData)
                            .filter(card => {
                            const regionTax = (myMagi._card.region === card._card.region) ? 0 : 1;
                            return card._card.type === TYPE_CREATURE && card._card.cost && (card._card.cost + regionTax) <= availableEnergy;
                        });
                        if (playable.length) {
                            const playableCreature = playable[0];
                            console.log(`Magi energy is ${availableEnergy}, playing card ${playableCreature.id}`);
                            return this.play(playableCreature.id);
                        }
                        return this.pass();
                    }
                    case STEP_NAME.ATTACK: {
                        const opponentMagi = this.gameState.getOpponentMagi();
                        if (opponentMagi) {
                            const TEMPORARY_OPPONENT_ID = this.playerId + 1;
                            const myMagi = this.gameState.getMyMagi();
                            const myCreatures = this.gameState.getMyCreaturesInPlay();
                            const enemyCreatures = this.gameState.getEnemyCreaturesInPlay();
                            const outerSim = createState(myCreatures, enemyCreatures, myMagi, opponentMagi, this.playerId || 1, TEMPORARY_OPPONENT_ID);
                            const hash = this.hashBuilder.makeHash(outerSim);
                            const simulationQueue = ActionExtractor.extractActions(outerSim, this.playerId, TEMPORARY_OPPONENT_ID, [], hash);
                            const initialScore = getStateScore(outerSim, this.playerId, TEMPORARY_OPPONENT_ID);
                            const bestAction = this.simulateAttacksQueue(simulationQueue, initialScore, TEMPORARY_OPPONENT_ID);
                            if (bestAction.type === ACTION_ATTACK) {
                                return this.simulationActionToClientAction(bestAction);
                            }
                        }
                        return this.pass();
                    }
                    default:
                        return this.pass();
                }
            }
        }
    }
}
// public static deckId = '62ed47ae99dd0db04e9f657b' // Online deck
// public static deckId = '5f60e45e11283f7c98d9259b' // Local deck (Naroom)
SimulationStrategy.deckId = '5f60e45e11283f7c98d9259c'; // Local deck (Arderial)
// public static deckId = '6305ec3aa14ce19348dfd7f9' // Local deck (Underneath/Naroom)
SimulationStrategy.failsafe = 1000;
