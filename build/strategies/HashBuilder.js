import { PROPERTY_ATTACKS_PER_TURN, TYPE_CREATURE, ZONE_TYPE_ACTIVE_MAGI, ZONE_TYPE_HAND, ZONE_TYPE_IN_PLAY } from "../const";
export class HashBuilder {
    constructor() {
        this.ids = new Map();
    }
    makeHash(sim) {
        const battlefieldCards = sim.getZone(ZONE_TYPE_IN_PLAY).cards;
        let cardHashes = [];
        battlefieldCards.forEach(card => {
            const attacks = sim.modifyByStaticAbilities(card, PROPERTY_ATTACKS_PER_TURN);
            const attacked = card.data.attacked;
            const attackPart = card.card.type === TYPE_CREATURE ? `(${attacked}/${attacks})` : '*';
            const energyPart = card.card.type === TYPE_CREATURE ? card.data.energy : '*';
            let powersPart = '';
            if (card.data.actionsUsed && card.data.actionsUsed.length) {
                powersPart = `[${card.data.actionsUsed.map((action) => this.convertHash(action)).join(',')}]`;
            }
            cardHashes.push(`#${this.convertHash(card.id)}${attackPart}${powersPart}:${energyPart}`);
        });
        const handCards = sim.getZone(ZONE_TYPE_HAND, sim.players[0]).cards;
        const handHashes = [];
        handCards.forEach(card => {
            handHashes.push(this.convertHash(card.id).toString());
        });
        const ourMagi = sim.getZone(ZONE_TYPE_ACTIVE_MAGI, sim.players[0]).card;
        const ourMagiHash = ourMagi ? `@${ourMagi.data.energy}[${ourMagi.data.actionsUsed.map((action) => this.convertHash(action)).join(',')}]` : 'X';
        const enemyMagi = sim.getZone(ZONE_TYPE_ACTIVE_MAGI, sim.players[1]).card;
        const enemyMagiHash = enemyMagi ? `@${enemyMagi.data.energy}` : 'X';
        return '{' + handHashes.join(',') + '}' + ourMagiHash + '|' + cardHashes.join('|') + '|' + enemyMagiHash + (sim.state.prompt ? '?' + this.convertHash(sim.state.promptGeneratedBy || '') : '');
    }
    convertHash(hash) {
        if (this.ids.has(hash)) {
            return this.ids.get(hash) || 999;
        }
        const nextId = this.ids.size + 1;
        this.ids.set(hash, nextId);
        return nextId;
    }
}
