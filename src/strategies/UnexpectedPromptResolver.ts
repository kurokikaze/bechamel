import { ClientAction } from 'duel-protocol';
import { PROMPT_TYPE_RELIC, PROMPT_TYPE_SINGLE_MAGI } from "../const.js";
import { GameState } from "../GameState.js";
import { byName } from 'moonlands/dist/esm/cards.js';
import {
    ACTION_RESOLVE_PROMPT,
    PROMPT_TYPE_SINGLE_CREATURE_FILTERED,
    PROMPT_TYPE_SINGLE_CREATURE,
    PROMPT_TYPE_SINGLE_CREATURE_OR_MAGI,
    PROMPT_TYPE_OWN_SINGLE_CREATURE,
    PROMPT_TYPE_ANY_CREATURE_EXCEPT_SOURCE,
    PROMPT_TYPE_CHOOSE_CARDS,
    PROMPT_TYPE_CHOOSE_N_CARDS_FROM_ZONE,
    PROMPT_TYPE_CHOOSE_UP_TO_N_CARDS_FROM_ZONE,
    PROMPT_TYPE_NUMBER,
    PROMPT_TYPE_PAYMENT_SOURCE,
    PROMPT_TYPE_ALTERNATIVE,
    PROMPT_TYPE_PLAYER,
    PROMPT_TYPE_MAGI_WITHOUT_CREATURES,
    PROMPT_TYPE_POWER_ON_MAGI,
    PROMPT_TYPE_REARRANGE_CARDS_OF_ZONE,
    PROMPT_TYPE_REARRANGE_ENERGY_ON_CREATURES,
    PROMPT_TYPE_DISTRIBUTE_ENERGY_ON_CREATURES,
    PROMPT_TYPE_DISTRIBUTE_DAMAGE_ON_CREATURES,
    PROMPT_TYPE_DISTRIBUTE_CARDS_IN_ZONES,
    COST_X,
} from "moonlands/dist/esm/const.js";

class UnexpectedPromptResolver  {
    public resolvePrompt(state: GameState): ClientAction {
        const promptType = state.getPromptType();
        const player = (state as any).playerId || 0;

        // Safe defaults for common prompt types. Never return a plain pass.
        switch (promptType) {
            case PROMPT_TYPE_SINGLE_CREATURE_FILTERED:
            case PROMPT_TYPE_SINGLE_CREATURE:
            case PROMPT_TYPE_OWN_SINGLE_CREATURE:
                return this.resolveCreaturePrompt(state);

            case PROMPT_TYPE_SINGLE_CREATURE_OR_MAGI: {
                const creatures = [
                    ...(state.getMyCreaturesInPlay() || []),
                    ...(state.getEnemyCreaturesInPlay() || []),
                ];
                const magi = [
                    (state as any).getMyMagi?.(),
                    ...((state as any).state?.zones?.opponentActiveMagi || []),
                ].filter(Boolean);
                const candidates = [...creatures, ...magi];
                if (candidates.length) {
                    const chosen = candidates.reduce((a: any, b: any) => (a.data.energy <= b.data.energy ? a : b));
                    return { type: ACTION_RESOLVE_PROMPT, promptType, target: chosen.id, player } as any;
                }
                break;
            }

            case PROMPT_TYPE_SINGLE_MAGI:
            case PROMPT_TYPE_MAGI_WITHOUT_CREATURES: {
                const magi = [
                    (state as any).getMyMagi?.(),
                    ...((state as any).state?.zones?.opponentActiveMagi || []),
                ].filter(Boolean);
                const creatures = promptType === PROMPT_TYPE_MAGI_WITHOUT_CREATURES
                    ? [...state.getMyCreaturesInPlay(), ...state.getEnemyCreaturesInPlay()]
                    : [];
                const candidates = magi.filter(magi => !creatures.some(creature => creature.data.controller === magi.data.controller));
                if (candidates.length) {
                    // Stab is the current source of this prompt. Prefer an
                    // exposed opponent over damaging our own undefended Magi.
                    const opponents = promptType === PROMPT_TYPE_MAGI_WITHOUT_CREATURES
                        ? candidates.filter(magi => magi.data.controller !== player) : [];
                    const targets = opponents.length ? opponents : candidates;
                    const chosen = targets.reduce((a: any, b: any) => (a.data.energy <= b.data.energy ? a : b));
                    return { type: ACTION_RESOLVE_PROMPT, promptType, target: chosen.id, player } as any;
                }
                throw new Error(`No legal Magi target for ${promptType}`);
            }

            case PROMPT_TYPE_RELIC: {
                const relics = [
                    ...(state.getMyRelicsInPlay() || []),
                    ...(state.getEnemyRelicsInPlay() || []),
                ]
                .filter(Boolean);
                if (relics.length) {
                    const chosen = relics.reduce((a: any, b: any) => (a.data.energy <= b.data.energy ? a : b));
                    return { type: ACTION_RESOLVE_PROMPT, promptType, target: chosen.id, player } as any;
                }
                break;
            }
            case PROMPT_TYPE_ANY_CREATURE_EXCEPT_SOURCE: {
                const src = (state as any).state?.promptParams?.source?.id;
                const my = state.getMyCreaturesInPlay() || [];
                const enemy = state.getEnemyCreaturesInPlay() || [];
                const all = [...my, ...enemy].filter((c: any) => c.id !== src);
                if (all.length) {
                    const chosen = all.reduce((a: any, b: any) => (a.data.energy <= b.data.energy ? a : b));
                    return { type: ACTION_RESOLVE_PROMPT, promptType, target: chosen.id, player } as any;
                }
                break;
            }

            case PROMPT_TYPE_CHOOSE_CARDS:
            case PROMPT_TYPE_CHOOSE_N_CARDS_FROM_ZONE:
            case PROMPT_TYPE_CHOOSE_UP_TO_N_CARDS_FROM_ZONE: {
                const params = (state as any).state?.promptParams || {};
                const zoneCards = params.cards || (state as any).state?.promptAvailableCards || [];
                const numberOfCards = params.numberOfCards ?? 1;
                const ids = zoneCards.map((c: any) => c.id || c).filter(Boolean);
                const chosen = ids.slice(0, numberOfCards);
                if (chosen.length || promptType === PROMPT_TYPE_CHOOSE_UP_TO_N_CARDS_FROM_ZONE || numberOfCards === 0) {
                    return { type: ACTION_RESOLVE_PROMPT, promptType, zone: params.zone, zoneOwner: params.zoneOwner, cards: chosen, player } as any;
                }
                break;
            }

            case PROMPT_TYPE_NUMBER: {
                const params = (state as any).state?.promptParams || {};
                const n = typeof params.min === 'number' ? params.min : 0;
                return { type: ACTION_RESOLVE_PROMPT, promptType, number: n, player } as any;
            }

            case PROMPT_TYPE_PAYMENT_SOURCE: {
                const candidates = state.getPaymentSourceCards();
                if (candidates && candidates.length) {
                    return { type: ACTION_RESOLVE_PROMPT, promptType, target: candidates[0], player } as any;
                }
                break;
            }

            case PROMPT_TYPE_ALTERNATIVE: {
                const alts = (state as any).state?.promptParams?.alternatives || (state as any).state?.promptAvailableCards || [];
                const first = Array.isArray(alts) && alts.length ? alts[0].value : null;
                if (first) return { type: ACTION_RESOLVE_PROMPT, promptType, alternative: first, player } as any;
                break;
            }

            case PROMPT_TYPE_POWER_ON_MAGI: {
                const magi = state.state.promptParams.magi;
                const source = Array.isArray(magi) ? magi[0] : magi;
                const definition = typeof source?.card === 'string' ? byName(source.card) : source?.card;
                const power = definition?.data.powers?.find(power => source && (
                    power.cost === COST_X ? source.data.energy >= 3
                        : typeof power.cost === 'number' && power.cost + 2 <= source.data.energy
                ));
                if (!power) throw new Error(`No affordable Magi power for ${promptType}`);
                return { type: ACTION_RESOLVE_PROMPT, promptType, power: power.name, player } as any;
            }
            case PROMPT_TYPE_PLAYER:
                return { type: ACTION_RESOLVE_PROMPT, promptType, targetPlayer: state.getOpponentId(), player } as any;

            case PROMPT_TYPE_DISTRIBUTE_CARDS_IN_ZONES: {
                const params = state.state.promptParams;
                const zones = params.targetZones ?? [];
                const destination = zones.find(zone => zone === params.sourceZone) ?? zones[0];
                if (!destination || !Array.isArray(params.cards)) break;
                // Keep the revealed cards in their original zone as a legal default
                // for Foresight, including a deck with fewer than two cards.
                const cards = Object.fromEntries(zones.map(zone => [zone, [] as string[]]));
                cards[destination] = params.cards.map(card => card.id);
                return { type: ACTION_RESOLVE_PROMPT, promptType, cards, player } as any;
            }

            case PROMPT_TYPE_REARRANGE_CARDS_OF_ZONE: {
                const params = state.state.promptParams;
                const cards = params.cards ?? state.state.promptAvailableCards ?? [];
                return {
                    type: ACTION_RESOLVE_PROMPT, promptType,
                    cards: cards.map((card: any) => typeof card === 'string' ? card : card.id),
                    generatedBy: state.state.promptGeneratedBy || '', player,
                } as any;
            }

            case PROMPT_TYPE_REARRANGE_ENERGY_ON_CREATURES: {
                const creatures = state.getMyCreaturesInPlay() || [];
                const energyOnCreatures = Object.fromEntries(creatures.map((creature: any) => [creature.id, creature.data.energy]));
                return {
                    type: ACTION_RESOLVE_PROMPT,
                    promptType,
                    energyOnCreatures,
                    generatedBy: (state as any).state?.promptGeneratedBy || '',
                    player,
                } as any;
            }

            case PROMPT_TYPE_DISTRIBUTE_ENERGY_ON_CREATURES:
            case PROMPT_TYPE_DISTRIBUTE_DAMAGE_ON_CREATURES: {
                const params = (state as any).state?.promptParams || {};
                const amount = params.amount || 0;
                const creatures = state.getMyCreaturesInPlay() || state.getEnemyCreaturesInPlay() || [];
                const ids = (creatures && creatures.length) ? creatures.map((c: any) => c.id) : ((state as any).state?.promptAvailableCards || []);
                if (ids && ids.length) {
                    const map: Record<string, number> = {};
                    // put everything on the first creature
                    map[ids[0]] = amount;
                    return {
                        type: ACTION_RESOLVE_PROMPT,
                        promptType,
                        energyOnCreatures: map,
                        damageOnCreatures: map,
                        generatedBy: (state as any).state?.promptGeneratedBy || '',
                        player,
                    } as any;
                }
                break;
            }
        }

        // Fallback: if the prompt provides available card ids, pick the first
        const available = (state as any).state?.promptAvailableCards || [];
        if (available && available.length) {
            const first = available[0];
            return { type: ACTION_RESOLVE_PROMPT, promptType: state.getPromptType(), target: first, player } as any;
        }

        throw new Error(`Cannot resolve prompt ${promptType}: no supported legal reply`);
    }

    private resolveCreaturePrompt(state: GameState): ClientAction {
        const promptType = state.getPromptType();
        const filtered = state.getCardsForFilteredPrompt();
        const own = state.getMyCreaturesInPlay() || [];
        // Never replace an empty filtered set with arbitrary targets.
        const candidates = promptType === PROMPT_TYPE_SINGLE_CREATURE_FILTERED ? filtered
            : promptType === PROMPT_TYPE_OWN_SINGLE_CREATURE ? own
            : [...own, ...(state.getEnemyCreaturesInPlay() || [])];

        if (candidates && candidates.length) {
            const chosen = candidates.reduce((a: any, b: any) => (a.data.energy <= b.data.energy ? a : b));
            return { type: ACTION_RESOLVE_PROMPT, promptType: state.getPromptType(), target: chosen.id, player: (state as any).playerId || 0 } as any;
        }

        throw new Error(`No legal creature target for ${promptType}`);
    }
}

export default UnexpectedPromptResolver;
