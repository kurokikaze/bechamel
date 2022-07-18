import {GameState} from '../GameState'
import {byName} from 'moonlands/dist/cards'
import {State} from 'moonlands/dist/index'
import CardInGame from 'moonlands/dist/classes/CardInGame'
import Zone from 'moonlands/dist/classes/Zone'
import { ZONE_TYPE_HAND, ZONE_TYPE_DECK, ZONE_TYPE_DISCARD, ZONE_TYPE_ACTIVE_MAGI, ZONE_TYPE_MAGI_PILE, ZONE_TYPE_DEFEATED_MAGI, ZONE_TYPE_IN_PLAY, TYPE_CREATURE } from "../const";

export const createZones = (player1: number, player2: number, creatures: CardInGame[] = [], activeMagi: CardInGame[] = []) => [
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
]

export const STEP_ATTACK = 2;

export function createState(
  myCreatures: any[],
  enemyCreatures: any[],
  myMagi: any,
  opponentMagi: any,
  playerId: number,
  opponentId: number,
): State {
  const myCreaturesCards = myCreatures.map(card => {
    const cardInGame = new CardInGame(byName(card.card), playerId).addEnergy(card.data.energy)
    cardInGame.data.attacked = card.data.attacked
    cardInGame.data.actionsUsed = card.data.actionsUsed
    cardInGame.id = card.id
    return cardInGame
  })
  const enemyCreaturesCards = enemyCreatures.map(card => {
    const cardInGame = new CardInGame(byName(card.card), opponentId).addEnergy(card.data.energy)
    cardInGame.data.attacked = card.data.attacked
    cardInGame.data.actionsUsed = card.data.actionsUsed
    cardInGame.id = card.id
    return cardInGame
  })
  const myMagiCard: CardInGame = new CardInGame(byName(myMagi.card), playerId).addEnergy(myMagi.data.energy)
  myMagiCard.data.actionsUsed = myMagi.data.actionsUsed
  myMagiCard.id = myMagi.id

  const enemyMagiCard: CardInGame = new CardInGame(byName(opponentMagi.card), opponentId).addEnergy(opponentMagi.data.energy)
  enemyMagiCard.data.actionsUsed = opponentMagi.data.actionsUsed
  enemyMagiCard.id = opponentMagi.id

  const zones = createZones(
    playerId,
    opponentId,
    [...myCreaturesCards, ...enemyCreaturesCards],
    [myMagiCard],
  )
  const sim = new State({
    zones,
    step: STEP_ATTACK,
    activePlayer: playerId,
  })
  sim.setPlayers(playerId, opponentId)
  sim.getZone(ZONE_TYPE_ACTIVE_MAGI, opponentId).add([enemyMagiCard])

  return sim
}

export const CARD_SCORE = 0.1
export const getStateScore = (state: State, attacker: number, opponent: number): number => {
  let myScore = 0
  let enemyScore = 0

  let myCreatures: string[] = []
  let enemyCreatures: string[] = []
  const creatures = state.getZone(ZONE_TYPE_IN_PLAY).cards.filter((card: CardInGame) => card.card.type === TYPE_CREATURE)
  creatures.forEach((creature: CardInGame) => {
    if (creature.owner === attacker) {
      myScore += creature.data.energy + CARD_SCORE
      myCreatures.push(`${creature.card.name}: ${creature.data.energy}`)
    } else {
      enemyScore += creature.data.energy + CARD_SCORE
      enemyCreatures.push(`${creature.card.name}: ${creature.data.energy}`)
    }
  })

  console.log(`Total creatures: ${creatures.length}`)
  console.log(`My creatures: ${myCreatures.join(', ')}`)
  console.log(`Enemy creatures: ${enemyCreatures.join(', ')}`)

  console.log(`My creatures score: ${myScore}, enemy creatures score: ${enemyScore}`)

  myScore += state.getZone(ZONE_TYPE_ACTIVE_MAGI, attacker).cards[0].data.energy
  enemyScore += state.getZone(ZONE_TYPE_ACTIVE_MAGI, opponent).cards[0].data.energy

  console.log(`My score: ${myScore}, enemy score: ${enemyScore}`)
  return myScore - enemyScore
}


