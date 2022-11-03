// import { RestrictionObjectType } from 'moonlands/dist/types';
import { ACTION_ATTACK, PROPERTY_ATTACKS_PER_TURN, ACTION_PASS, TYPE_CREATURE, ZONE_TYPE_ACTIVE_MAGI, ZONE_TYPE_IN_PLAY, PROMPT_TYPE_OWN_SINGLE_CREATURE, ACTION_RESOLVE_PROMPT, PROMPT_TYPE_MAY_ABILITY, PROMPT_TYPE_NUMBER, PROMPT_TYPE_SINGLE_CREATURE, PROMPT_TYPE_SINGLE_MAGI, ACTION_POWER, ZONE_TYPE_HAND, TYPE_SPELL, ACTION_PLAY, REGION_UNIVERSAL, PROMPT_TYPE_SINGLE_CREATURE_FILTERED } from '../const';
const STEP_NAME = {
    ENERGIZE: 0,
    PRS1: 1,
    ATTACK: 2,
    CREATURES: 3,
    PRS2: 4,
    DRAW: 5,
};
export class ActionExtractor {
    static extractActions(sim, playerId, opponentId, actionLog, previousHash) {
        if (sim.state.activePlayer !== playerId) {
            return [];
        }
        if (sim.state.prompt) {
            return ActionExtractor.extractPromptAction(sim, playerId, opponentId, actionLog, previousHash);
        }
        const step = sim.state.step;
        switch (step) {
            case STEP_NAME.ENERGIZE: {
                return [];
            }
            // Fall through is intended
            case STEP_NAME.PRS1:
            case STEP_NAME.PRS2: {
                const magiCard = sim.getZone(ZONE_TYPE_ACTIVE_MAGI, playerId).card;
                if (!magiCard)
                    return [ActionExtractor.getPassAction(sim, playerId, actionLog, previousHash)];
                const mySimCreatures = sim.getZone(ZONE_TYPE_IN_PLAY).cards.filter(card => card.owner === playerId);
                const creaturesWithPowers = mySimCreatures.filter(creature => creature.card.data.powers && creature.data.actionsUsed.length === 0);
                const simulationQueue = [];
                simulationQueue.push(ActionExtractor.getPassAction(sim, playerId, actionLog, previousHash));
                creaturesWithPowers.forEach(card => {
                    var _a, _b;
                    const power = ((_b = (_a = card.card) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.powers) ? card.card.data.powers[0] : null;
                    // Don't forget: Relic powers are paid from the Magi
                    const energyReserve = card.card.type === TYPE_CREATURE ? card.data.energy : magiCard.data.energy;
                    if (power && power.cost <= energyReserve) {
                        const innerSim = sim.clone();
                        const action = {
                            type: ACTION_POWER,
                            source: innerSim.getZone(ZONE_TYPE_IN_PLAY).byId(card.id),
                            power,
                            player: playerId,
                        };
                        simulationQueue.push({
                            sim: innerSim,
                            action,
                            actionLog: [...actionLog, action],
                            previousHash,
                        });
                    }
                });
                if (magiCard && magiCard.card.data.powers && magiCard.card.data.powers.length) {
                    magiCard.card.data.powers.forEach((power) => {
                        if (!magiCard.data.actionsUsed.includes(power.name) && power.cost <= magiCard.data.energy) {
                            const innerSim = sim.clone();
                            const action = {
                                type: ACTION_POWER,
                                source: innerSim.getZone(ZONE_TYPE_ACTIVE_MAGI, playerId).card,
                                power,
                                player: playerId,
                            };
                            simulationQueue.push({
                                sim: innerSim,
                                action,
                                actionLog: [...actionLog, action],
                                previousHash,
                            });
                        }
                    });
                }
                const playableSpells = sim.getZone(ZONE_TYPE_HAND, playerId).cards.filter(card => card.card.type === TYPE_SPELL);
                playableSpells.forEach(spell => {
                    const innerSim = sim.clone();
                    const card = innerSim.getZone(ZONE_TYPE_HAND, playerId).byId(spell.id);
                    if (card && spell.card.cost <= magiCard.data.energy) {
                        const action = {
                            type: ACTION_PLAY,
                            payload: {
                                card,
                                player: playerId,
                            }
                        };
                        simulationQueue.push({
                            sim: innerSim,
                            action,
                            actionLog: [...actionLog, action],
                            previousHash,
                        });
                    }
                });
                return simulationQueue;
            }
            case STEP_NAME.ATTACK: {
                const attackPatterns = ActionExtractor.getAllAttackPatterns(sim, playerId, opponentId);
                const workEntities = [ActionExtractor.getPassAction(sim, playerId, actionLog, previousHash)];
                attackPatterns.forEach(pattern => {
                    const innerSim = sim.clone();
                    const source = innerSim.getZone(ZONE_TYPE_IN_PLAY).byId(pattern.from);
                    const target = innerSim.getZone(ZONE_TYPE_IN_PLAY).byId(pattern.to) || innerSim.getZone(ZONE_TYPE_ACTIVE_MAGI, opponentId).byId(pattern.to);
                    const additionalAttackers = pattern.add ? [innerSim.getZone(ZONE_TYPE_IN_PLAY).byId(pattern.add)] : [];
                    if (source && target) {
                        const action = additionalAttackers ? {
                            type: ACTION_ATTACK,
                            source,
                            additionalAttackers,
                            target,
                            player: playerId,
                        } :
                            {
                                type: ACTION_ATTACK,
                                source,
                                target,
                                player: playerId,
                            };
                        workEntities.push({
                            sim: innerSim,
                            action,
                            actionLog: [...actionLog, action],
                            previousHash,
                        });
                    }
                });
                return workEntities;
            }
            case STEP_NAME.CREATURES: {
                const magiCard = sim.getZone(ZONE_TYPE_ACTIVE_MAGI, playerId).card;
                const simulationQueue = [ActionExtractor.getPassAction(sim, playerId, actionLog, previousHash)];
                if (magiCard) {
                    const playableCreatures = sim.getZone(ZONE_TYPE_HAND, playerId).cards.filter(card => card.card.type === TYPE_CREATURE);
                    playableCreatures.forEach(creature => {
                        const regionTax = (creature.card.region === magiCard.card.region || creature.card.region === REGION_UNIVERSAL) ? 0 : 1;
                        if ((typeof creature.card.cost == 'number') && (creature.card.cost + regionTax <= magiCard.data.energy)) {
                            const innerSim = sim.clone();
                            const card = innerSim.getZone(ZONE_TYPE_HAND, playerId).byId(creature.id);
                            const action = {
                                type: ACTION_PLAY,
                                payload: {
                                    card,
                                    player: playerId,
                                }
                            };
                            simulationQueue.push({
                                sim: innerSim,
                                action,
                                actionLog: [...actionLog, action],
                                previousHash,
                            });
                        }
                    });
                }
                return simulationQueue;
            }
            case STEP_NAME.DRAW: {
                return [];
            }
        }
        return [];
    }
    static getPassAction(sim, playerId, actionLog, previousHash) {
        const innerSim = sim.clone();
        const passAction = {
            type: ACTION_PASS,
            player: playerId,
        };
        return {
            sim: innerSim,
            action: passAction,
            actionLog: [...actionLog, passAction],
            previousHash,
        };
    }
    static extractPromptAction(sim, playerId, opponentId, actionLog, previousHash) {
        switch (sim.state.promptType) {
            case PROMPT_TYPE_MAY_ABILITY: {
                const actionYes = {
                    action: ACTION_RESOLVE_PROMPT,
                    promptType: PROMPT_TYPE_MAY_ABILITY,
                    generatedBy: sim.state.promptGeneratedBy,
                    useEffect: true,
                    player: sim.state.promptPlayer,
                };
                const actionNo = {
                    action: ACTION_RESOLVE_PROMPT,
                    promptType: PROMPT_TYPE_MAY_ABILITY,
                    generatedBy: sim.state.promptGeneratedBy,
                    useEffect: false,
                    player: sim.state.promptPlayer,
                };
                return [
                    {
                        sim: sim.clone(),
                        action: actionYes,
                        actionLog: [...actionLog, actionYes],
                        previousHash,
                    },
                    {
                        sim: sim.clone(),
                        action: actionNo,
                        actionLog: [...actionLog, actionNo],
                        previousHash,
                    },
                ];
            }
            case PROMPT_TYPE_SINGLE_CREATURE_FILTERED: {
                const allCreatures = sim.getZone(ZONE_TYPE_IN_PLAY).cards
                    .filter((card) => card.card.type === TYPE_CREATURE);
                let filteredCreatures = allCreatures;
                if (sim.state.promptParams.restrictions) {
                    const filter = sim.makeCardFilter(sim.state.promptParams.restrictions);
                    filteredCreatures = allCreatures.filter(filter);
                }
                const simulationQueue = [];
                filteredCreatures.forEach(creature => {
                    const innerSim = sim.clone();
                    const action = {
                        type: ACTION_RESOLVE_PROMPT,
                        promptType: PROMPT_TYPE_OWN_SINGLE_CREATURE,
                        target: innerSim.getZone(ZONE_TYPE_IN_PLAY).byId(creature.id),
                        generatedBy: innerSim.state.promptGeneratedBy,
                        playerId: innerSim.state.promptPlayer,
                    };
                    simulationQueue.push({
                        sim: innerSim,
                        action,
                        actionLog: [...actionLog, action],
                        previousHash,
                    });
                });
                return simulationQueue;
            }
            case PROMPT_TYPE_SINGLE_CREATURE: {
                const allCreatures = sim.getZone(ZONE_TYPE_IN_PLAY).cards
                    .filter((card) => card.card.type === TYPE_CREATURE);
                const simulationQueue = [];
                allCreatures.forEach(creature => {
                    const innerSim = sim.clone();
                    const action = {
                        type: ACTION_RESOLVE_PROMPT,
                        promptType: PROMPT_TYPE_OWN_SINGLE_CREATURE,
                        target: innerSim.getZone(ZONE_TYPE_IN_PLAY).byId(creature.id),
                        generatedBy: innerSim.state.promptGeneratedBy,
                        playerId: innerSim.state.promptPlayer,
                    };
                    simulationQueue.push({
                        sim: innerSim,
                        action,
                        actionLog: [...actionLog, action],
                        previousHash,
                    });
                });
                return simulationQueue;
            }
            case PROMPT_TYPE_NUMBER: {
                const min = sim.state.promptParams.min;
                const max = sim.state.promptParams.max;
                const simulationQueue = [];
                if (typeof min === 'number' && typeof max === 'number') {
                    for (let i = min; i < max; i++) {
                        const innerSim = sim.clone();
                        const action = {
                            type: ACTION_RESOLVE_PROMPT,
                            promptType: PROMPT_TYPE_NUMBER,
                            number: i,
                            generatedBy: sim.state.promptGeneratedBy,
                            playerId: sim.state.promptPlayer,
                        };
                        simulationQueue.push({
                            sim: innerSim,
                            action,
                            actionLog: [...actionLog, action],
                            previousHash,
                        });
                    }
                }
                return simulationQueue;
            }
            case PROMPT_TYPE_OWN_SINGLE_CREATURE: {
                const myCreatures = sim.getZone(ZONE_TYPE_IN_PLAY).cards
                    .filter((card) => card.card.type === TYPE_CREATURE && card.owner === playerId);
                const simulationQueue = [];
                myCreatures.forEach(creature => {
                    const innerSim = sim.clone();
                    const action = {
                        type: ACTION_RESOLVE_PROMPT,
                        promptType: PROMPT_TYPE_OWN_SINGLE_CREATURE,
                        target: innerSim.getZone(ZONE_TYPE_IN_PLAY).byId(creature.id),
                        generatedBy: innerSim.state.promptGeneratedBy,
                        playerId: innerSim.state.promptPlayer,
                    };
                    simulationQueue.push({
                        sim: innerSim,
                        action,
                        actionLog: [...actionLog, action],
                        previousHash,
                    });
                });
                return simulationQueue;
            }
            case PROMPT_TYPE_SINGLE_MAGI: {
                const myMagi = sim.getZone(ZONE_TYPE_ACTIVE_MAGI, playerId).card;
                const simulationQueue = [];
                if (myMagi) {
                    const innerSim = sim.clone();
                    const action = {
                        type: ACTION_RESOLVE_PROMPT,
                        promptType: PROMPT_TYPE_SINGLE_MAGI,
                        target: innerSim.getZone(ZONE_TYPE_ACTIVE_MAGI, playerId).card,
                        generatedBy: innerSim.state.promptGeneratedBy,
                        playerId: innerSim.state.promptPlayer,
                    };
                    simulationQueue.push({
                        sim: innerSim,
                        action,
                        actionLog: [...actionLog, action],
                        previousHash,
                    });
                }
                const opponentMagi = sim.getZone(ZONE_TYPE_ACTIVE_MAGI, opponentId).card;
                if (opponentMagi) {
                    const innerSim = sim.clone();
                    const action = {
                        type: ACTION_RESOLVE_PROMPT,
                        promptType: PROMPT_TYPE_SINGLE_MAGI,
                        target: innerSim.getZone(ZONE_TYPE_ACTIVE_MAGI, opponentId).card,
                        generatedBy: innerSim.state.promptGeneratedBy,
                        playerId: innerSim.state.promptPlayer,
                    };
                    simulationQueue.push({
                        sim: innerSim,
                        action,
                        actionLog: [...actionLog, action],
                        previousHash,
                    });
                }
                return simulationQueue;
            }
            default: {
                console.log(`No handler for ${sim.state.promptType} prompt types`);
                return [];
            }
        }
    }
    static getAllAttackPatterns(sim, attacker, opponent) {
        const creatures = sim.getZone(ZONE_TYPE_IN_PLAY).cards.filter((card) => card.card.type === TYPE_CREATURE);
        const attackers = creatures.filter((card) => card.owner === attacker);
        const defenders = creatures.filter((card) => card.owner !== attacker);
        const enemyMagi = sim.getZone(ZONE_TYPE_ACTIVE_MAGI, opponent).cards[0];
        const result = [];
        const packHunters = attackers.filter(card => card.card.data.canPackHunt);
        for (let attacker of attackers) {
            const numberOfAttacks = sim.modifyByStaticAbilities(attacker, PROPERTY_ATTACKS_PER_TURN);
            if (attacker.data.attacked < numberOfAttacks) {
                if ((!defenders.length || attacker.card.data.canAttackMagiDirectly) && enemyMagi && enemyMagi.data.energy > 0) {
                    result.push({ from: attacker.id, to: enemyMagi.id });
                }
                for (let defender of defenders) {
                    result.push({ from: attacker.id, to: defender.id });
                    for (let packHunter of packHunters) {
                        if (packHunter.id !== attacker.id) {
                            result.push({ from: attacker.id, add: packHunter.id, to: defender.id });
                        }
                    }
                }
            }
        }
        return result;
    }
}
