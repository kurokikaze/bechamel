import {byName} from 'moonlands/dist/cards'
import {State} from 'moonlands/dist/index'
import CardInGame from 'moonlands/dist/classes/CardInGame'
import Zone from 'moonlands/dist/classes/Zone'
import {
  PROPERTY_ATTACKS_PER_TURN,
  ZONE_TYPE_ACTIVE_MAGI,
  ZONE_TYPE_DECK,
  ZONE_TYPE_DEFEATED_MAGI,
  ZONE_TYPE_DISCARD,
  ZONE_TYPE_HAND,
  ZONE_TYPE_IN_PLAY,
  ZONE_TYPE_MAGI_PILE,
} from '../const';

import {
  ACTION_ATTACK,
  ACTION_PASS,
  ACTION_PLAY,
  ACTION_POWER,
  ACTION_RESOLVE_PROMPT,
  PROMPT_TYPE_CHOOSE_CARDS,
  TYPE_CREATURE, TYPE_RELIC
} from "../const";
import {GameState} from "../GameState";
import {Strategy} from './Strategy';
import {createState, getStateScore} from './simulationUtils'

const STEP_ATTACK = 2;

const createZones = (player1: number, player2: number, creatures: CardInGame[] = [], activeMagi: CardInGame[] = []) => [
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

const STEP_NAME = {
  ENERGIZE: 0,
  PRS1: 1,
  ATTACK: 2,
  CREATURES: 3,
  PRS2: 4,
  DRAW: 5,
}

type AttackPattern = {
  from: string, to: string,
}

type SimulationEntity = {
  sim: State,
  action: any,
  actionLog: any[]
}

const getAllAttackPatterns = (state: State, attacker: number, opponent: number): AttackPattern[] => {
  const creatures = state.getZone(ZONE_TYPE_IN_PLAY).cards.filter((card: CardInGame) => card.card.type === TYPE_CREATURE)
  const attackers = creatures.filter((card: CardInGame) => card.owner === attacker)
  const defenders = creatures.filter((card: CardInGame) => card.owner !== attacker)
  const enemyMagi = state.getZone(ZONE_TYPE_ACTIVE_MAGI, opponent).cards[0]

  const result: AttackPattern[] = []
  for (let attacker of attackers) {
    const numberOfAttacks = state.modifyByStaticAbilities(attacker, PROPERTY_ATTACKS_PER_TURN)
    if (attacker.data.attacked < numberOfAttacks) {
      if ((!defenders.length || attacker.card.data.canAttackMagiDirectly) && enemyMagi) {
        result.push({from: attacker.id, to: enemyMagi.id})
      }
      for (let defender of defenders) {
        result.push({from: attacker.id, to: defender.id})
      }
    }
  }

  return result
}

const addCardData = (card: any) => ({
  ...card,
  _card: byName(card.card),
})

export class SimulationStrategy implements Strategy {
  public static deckId = '5f60e45e11283f7c98d9259b'

  private waitingTarget?: {
    source: string
    target: string
  }

  private playerId?: number
  private gameState?: GameState

  constructor() {}

  public setup(state: GameState, playerId: number) {
    this.gameState = state
    this.playerId = playerId
  }

  private pass(): any {
    return {
      type: ACTION_PASS,
      player: this.playerId,
    }
  }

  private play(cardId: string): any {
    return {
      type: ACTION_PLAY,
      payload: {
        card: cardId,
        player: this.playerId,
      }
    }
  }

  private attack(from: string, to: string): any {
    return {
      type: ACTION_ATTACK,
      source: from,
      target: to,
      player: this.playerId,
    }
  }

  private power(source: string, power: string) {
    return {
      type: ACTION_POWER,
      source,
      power,
      player: this.playerId,
    }
  }

  private resolvePrompt(target: string) {
    return {
      type: ACTION_RESOLVE_PROMPT,
      promptType: this.gameState?.getPromptType(),
      target,
      player: this.playerId,
    }
  }

  public requestAction() {
    if (this.gameState && this.playerId) {
      if (this.gameState.waitingForCardSelection()) {
        return {
          type: ACTION_RESOLVE_PROMPT,
          promptType: PROMPT_TYPE_CHOOSE_CARDS,
          cards: this.gameState.getStartingCards(),
          player: this.playerId,
        }
      }

      if (this.waitingTarget && this.gameState.waitingForTarget(this.waitingTarget.source, this.playerId)) {
        return this.resolvePrompt(this.waitingTarget.target)
      }

      if (this.gameState.playerPriority(this.playerId)) {
        const step = this.gameState.getStep()
        switch(step) {
          case STEP_NAME.PRS1: {
            const playable = this.gameState.getPlayableCards()
              .map(addCardData)
              .filter((card: any) => card._card.type === TYPE_RELIC)
            const relics = this.gameState.getMyRelicsInPlay().map(card => card._card.name)

            if (playable.some(card => !relics.includes(card._card.name))) {
              const playableRelic = playable.find(card => !relics.includes(card._card.name))
              if (playableRelic) {
                this.play(playableRelic?.id)
              }
              return this.pass()
            }
            return this.pass()
          }
          case STEP_NAME.PRS2: {
            const relics = this.gameState.getMyRelicsInPlay().map(card => card._card.name)
            const enemyCreatures = this.gameState.getEnemyCreaturesInPlay()

            if (relics.some(card => card.card === 'Siphon Stone') && enemyCreatures.some(card => card.data.energy === 1)) {
              const stone = relics.find(card => card.card === 'Siphon Stone')
              const target =  enemyCreatures.find(card => card.data.energy === 1) || { id: 'wrong target'}
              stone._card = byName('Siphon Stone')

              this.waitingTarget = { source: stone.id, target: target.id}
              return this.power(stone.id, stone._card.data.powers[0].name)
            } else {
              const ourMagi = this.gameState.getMyMagi()
              switch (ourMagi.card) {
                case 'Pruitt': {
                  const ourCreatures = [...this.gameState.getMyCreaturesInPlay()]
                  if (ourCreatures.length > 0 && ourMagi.data.energy >= 2 && !ourMagi.data.actionsUsed.includes('Refresh')) {
                    ourCreatures.sort((a, b) => a.data.energy - b.data.energy)
                    this.waitingTarget = {
                      source: ourMagi.id,
                      target: ourCreatures[0].id,
                    }
                    return this.power(ourMagi.id, 'Refresh')
                  }
                  return this.pass()
                }
                case 'Poad': {
                  const ourCreatures = this.gameState.getMyCreaturesInPlay()
                  if (ourCreatures.length > 2 && ourMagi.data.energy >= 2 && !ourMagi.data.actionsUsed.includes('Heroes\' Feast')) {
                    return this.power(ourMagi.id, 'Heroes\' Feast')
                  }
                  return this.pass()
                }
                default: {
                  return this.pass()
                }
              }
            }
          }
          case STEP_NAME.CREATURES: {
            const myMagi = this.gameState.getMyMagi()
            myMagi._card = byName(myMagi.card)
            const availableEnergy = myMagi.data.energy
            const playable = this.gameState.getPlayableCards()
              .map(addCardData)
              .filter(card => {
                const regionTax = (myMagi._card.region === card._card.region) ? 0 : 1
                return card._card.type === TYPE_CREATURE && card._card.cost && (card._card.cost + regionTax) <= availableEnergy
              })
            if (playable.length) {
              const playableCreature = playable[0]
              return this.play(playableCreature.id)
            }
            return this.pass()
          }
          case STEP_NAME.ATTACK: {
            const opponentMagi = this.gameState.getOpponentMagi()
            if (opponentMagi) {
              const TEMPORARY_OPPONENT_ID = this.playerId + 1
              const myMagi = this.gameState.getMyMagi()
              const myCreatures = this.gameState.getMyCreaturesInPlay()

              const myCreaturesCards = myCreatures.map(card => {
                const cardInGame = new CardInGame(byName(card.card), this.playerId).addEnergy(card.data.energy)
                cardInGame.data.attacked = card.data.attacked
                cardInGame.data.actionsUsed = [...card.data.actionsUsed]
                cardInGame.id = card.id
                return cardInGame
              })
              const enemyCreatures = this.gameState.getEnemyCreaturesInPlay()
              console.log('myCreatures')
              console.dir(myCreatures)
              const enemyCreaturesCards = enemyCreatures.map(card => {
                const cardInGame = new CardInGame(byName(card.card), TEMPORARY_OPPONENT_ID).addEnergy(card.data.energy)
                cardInGame.data.attacked = card.data.attacked
                cardInGame.data.actionsUsed = [...card.data.actionsUsed]
                cardInGame.id = card.id
                return cardInGame
              })
              const myMagiCard = new CardInGame(byName(myMagi.card), this.playerId)
              myMagiCard.data.actionsUsed = myMagi.data.actionsUsed
              myMagiCard.addEnergy(myMagi.data.energy)
              myMagiCard.id = myMagi.id

              const enemyMagiCard = new CardInGame(byName(opponentMagi.card), TEMPORARY_OPPONENT_ID)
              enemyMagiCard.data.actionsUsed = opponentMagi.data.actionsUsed
              enemyMagiCard.addEnergy(opponentMagi.data.energy)
              enemyMagiCard.id = opponentMagi.id

              const zones = createZones(
                this.playerId,
                TEMPORARY_OPPONENT_ID,
                [...myCreaturesCards, ...enemyCreaturesCards],
                [myMagiCard],
              )
              const outerSim: State = new State({
                zones,
                step: STEP_ATTACK,
                activePlayer: this.playerId,
              })
              outerSim.setPlayers(this.playerId, TEMPORARY_OPPONENT_ID)
              outerSim.getZone(ZONE_TYPE_ACTIVE_MAGI, TEMPORARY_OPPONENT_ID).add([enemyMagiCard])

              const attackPatterns = getAllAttackPatterns(outerSim, this.playerId, TEMPORARY_OPPONENT_ID)
              const simulationQueue: SimulationEntity[] = []
              attackPatterns.forEach(pattern => {                
                const sim = createState(myCreatures, enemyCreatures, myMagi, opponentMagi, this.playerId || 1, TEMPORARY_OPPONENT_ID)
                const action = {
                  type: ACTION_ATTACK,
                  source: sim.getZone(ZONE_TYPE_IN_PLAY).byId(pattern.from),
                  target: sim.getZone(ZONE_TYPE_IN_PLAY).byId(pattern.to) || sim.getZone(ZONE_TYPE_ACTIVE_MAGI, TEMPORARY_OPPONENT_ID).byId(pattern.to),
                  player: this.playerId,
                }
                simulationQueue.push({
                  sim,
                  action,
                  actionLog: [action],
                })
              })

              const initialScore = getStateScore(outerSim, this.playerId, TEMPORARY_OPPONENT_ID)
              let bestAction: {score: number, action: any[] } = {
                score: initialScore,
                action: []
              }
              // Simulation itself
              while (simulationQueue.length) {
                const workEntity = simulationQueue.pop()
                workEntity?.sim.update(workEntity?.action)

                const score = getStateScore(workEntity?.sim, this.playerId, TEMPORARY_OPPONENT_ID)
                console.log(`Simulation complete, score is ${score}`)
                if (score > bestAction.score) {
                  bestAction.score = score
                  bestAction.action = workEntity?.actionLog || []
                }
              }

              console.log(`Best found score is ${bestAction.score} (initial is ${initialScore})`)
              if (bestAction.action.length) {
                return this.attack(bestAction.action[0].source.id, bestAction.action[0].target.id)
              }
              return this.pass()
            }
          }
          default:
            return this.pass()
        }
      }
    }
  }
}
