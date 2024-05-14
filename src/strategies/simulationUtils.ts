import {byName} from 'moonlands/src/cards'
import {State, TYPE_RELIC} from 'moonlands/src'
import CardInGame from 'moonlands/src/classes/CardInGame'
import Zone from 'moonlands/src/classes/Zone'

import { ZONE_TYPE_HAND, ZONE_TYPE_DECK, ZONE_TYPE_DISCARD, ZONE_TYPE_ACTIVE_MAGI, ZONE_TYPE_MAGI_PILE, ZONE_TYPE_DEFEATED_MAGI, ZONE_TYPE_IN_PLAY, TYPE_CREATURE } from "../const";
import { GameState } from '../GameState';
import Card from 'moonlands/src/classes/Card';

const addCardData = (card: any) => ({
  ...card,
  _card: byName(card.card),
})

type StateShape = State["state"];
export const booleanGuard = Boolean as any as <T>(x: T | false | undefined | null | "" | 0) => x is T;

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

const defaultState: StateShape = {
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
  attachedTo: {},
  cardsAttached: {}
}

export const STEP_ATTACK = 2;

export function createState(
  gameState: GameState,
  playerId: number,
  opponentId: number,
): State {
  const myMagi = gameState.getMyMagi()
  const myCreatures = gameState.getMyCreaturesInPlay()
  const myMagiPile = gameState.getMyMagiPile()
  const myRelics = gameState.getMyRelicsInPlay()
  const opponentMagi = gameState.getOpponentMagi()

  const enemyCreatures = gameState.getEnemyCreaturesInPlay()
  const enemyRelics = gameState.getEnemyRelicsInPlay()

  const myCreaturesCards = [...myCreatures, ...myRelics].map(card => {
    const creatureCard = byName(card.card.name)
    if (!creatureCard) {
      return false
    }
    const cardInGame = new CardInGame(creatureCard, playerId).addEnergy(card.data.energy)
    cardInGame.data.attacked = card.data.attacked
    cardInGame.data.wasAttacked = card.data.wasAttacked
    cardInGame.data.hasAttacked = card.data.hasAttacked
    cardInGame.data.controller = card.data.controller
    cardInGame.data.actionsUsed = [...card.data.actionsUsed]
    cardInGame.id = card.id
    return cardInGame
  }).filter(booleanGuard)
  const enemyCreaturesCards = [...enemyCreatures, ...enemyRelics].map(card => {
    const creatureCard = byName(card.card.name)
    if (!creatureCard) {
      return false
    }
    const cardInGame = new CardInGame(creatureCard, opponentId).addEnergy(card.data.energy)
    cardInGame.data.attacked = card.data.attacked
    cardInGame.data.wasAttacked = card.data.wasAttacked
    cardInGame.data.hasAttacked = card.data.hasAttacked
    cardInGame.data.controller = card.data.controller
    cardInGame.data.actionsUsed = [...card.data.actionsUsed]
    cardInGame.id = card.id
    return cardInGame
  }).filter(booleanGuard)

  const zones = createZones(
    playerId,
    opponentId,
    [...myCreaturesCards, ...enemyCreaturesCards],
    [],
  )
  const sim = new State({
    ...defaultState,
    zones,
    step: STEP_ATTACK,
    activePlayer: playerId,
    prompt: false,
    promptParams: {},
    log: [],
  })
  sim.setPlayers(playerId, opponentId)

  const myMagiActualCard = byName(myMagi?.card)
  if (myMagi && myMagiActualCard) {
    if (!myMagi.data.actionsUsed) {
      console.log('Found the case with missing actionsUsed')
      console.dir(myMagi)
      console.log('data:')
      console.dir(myMagi.data)
    }
    const myMagiCard: CardInGame = new CardInGame(myMagiActualCard, playerId).addEnergy(myMagi.data.energy)
    myMagiCard.data.actionsUsed = [...myMagi.data.actionsUsed]
    myMagiCard.id = myMagi.id
    sim.getZone(ZONE_TYPE_ACTIVE_MAGI, playerId).add([myMagiCard])
  }

  sim.getZone(ZONE_TYPE_MAGI_PILE, playerId).add(myMagiPile.map(magi => {
    const baseCard = byName(magi.card)
    if (!baseCard) return false;
    const card = new CardInGame(baseCard, playerId)
    card.id = magi.id
    return card
  }).filter<CardInGame>((a): a is CardInGame => a instanceof CardInGame))

  const enemyMagiRealCard = byName(opponentMagi?.card)
  if (opponentMagi && enemyMagiRealCard) {
    const enemyMagiCard: CardInGame = new CardInGame(enemyMagiRealCard, opponentId).addEnergy(opponentMagi.data.energy)
    enemyMagiCard.data.actionsUsed = [...opponentMagi.data.actionsUsed]
    enemyMagiCard.id = opponentMagi.id
    sim.getZone(ZONE_TYPE_ACTIVE_MAGI, opponentId).add([enemyMagiCard])
  }
  const playableEnrichedCards = gameState.getPlayableCards()
    .map(addCardData).filter(card => card._card.type !== TYPE_RELIC)

  sim.getZone(ZONE_TYPE_HAND, playerId).add(playableEnrichedCards.map((card): CardInGame | false => {
    const baseCard = byName(card.card)
    if (!baseCard) return false;
    const gameCard = new CardInGame(baseCard, playerId)
    gameCard.id = card.id
    return gameCard
  }).filter<CardInGame>((a): a is CardInGame => a instanceof CardInGame))

  const myDeckCardIds = gameState.getMyDeckCards()

  // stuff the deck with the wild cards
  sim.getZone(ZONE_TYPE_DECK, playerId).add(myDeckCardIds.map(id => {
    const card = new CardInGame(byName('Grega') as Card, playerId);
    card.id = id;
    return card;
  }));

  sim.state.continuousEffects = gameState.getContinuousEffects();
  sim.state.step = gameState.getStep()
  const seed = gameState.getTurn() * 100 + gameState.getStep() * 10 + gameState.playerId
  sim.initiatePRNG(seed)
  return sim
}

export const CARD_SCORE = 0.1
export const getStateScore = (state: State, attacker: number, opponent: number): number => {
  let myScore = 0
  let enemyScore = 0

  const creatures = state.getZone(ZONE_TYPE_IN_PLAY).cards.filter((card: CardInGame) => card.card.type === TYPE_CREATURE)
  creatures.forEach((creature: CardInGame) => {
    if (creature.owner === attacker) {
      myScore += creature.data.energy + CARD_SCORE
    } else {
      enemyScore += creature.data.energy + CARD_SCORE
    }
  })

  const myMagi = state.getZone(ZONE_TYPE_ACTIVE_MAGI, attacker).card
  if (myMagi) {
    myScore += myMagi.data.energy
  }
  const enemyMagi = state.getZone(ZONE_TYPE_ACTIVE_MAGI, opponent).card
  if (enemyMagi) {
    enemyScore += enemyMagi.data.energy
  }
  if (state.hasWinner()) {
    if (state.winner === opponent) {
      enemyScore += 1000;
    } else {
      myScore += 1000;
    }
  }
  return myScore - enemyScore
}
