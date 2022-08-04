import {byName} from 'moonlands/dist/cards'
import {State} from 'moonlands/dist/index'
import CardInGame from 'moonlands/dist/classes/CardInGame'

import {
  PROMPT_TYPE_MAY_ABILITY,
  PROMPT_TYPE_NUMBER,
  PROMPT_TYPE_OWN_SINGLE_CREATURE,
  PROMPT_TYPE_SINGLE_CREATURE,
  PROMPT_TYPE_SINGLE_MAGI,
  PROPERTY_ATTACKS_PER_TURN,
  TYPE_SPELL,
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
import {GameState, SimplifiedCard} from "../GameState";
import {Strategy} from './Strategy';
import {createState, getStateScore, booleanGuard} from './simulationUtils'
import { HashBuilder } from './HashBuilder';

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
  private hashBuilder: HashBuilder

  private actionsOnHold: any[] = []

  constructor() {
    this.hashBuilder = new HashBuilder()
  }

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

  private resolveTargetPrompt(target: string) {
    return {
      type: ACTION_RESOLVE_PROMPT,
      promptType: this.gameState?.getPromptType(),
      target,
      player: this.playerId,
    }
  }

  private resolveNumberPrompt(number: number) {
    return {
      type: ACTION_RESOLVE_PROMPT,
      promptType: this.gameState?.getPromptType(),
      number,
      player: this.playerId,
    }
  }

  private simulationActionToClientAction(simAction: any) {
    switch(simAction.type) {
      case ACTION_PLAY: {
        return this.play(simAction.payload.card.id)
      }
      case ACTION_POWER: {
        return this.power(simAction.source.id, simAction.power.name)
      }
      case ACTION_ATTACK: {
        return this.attack(simAction.source.id, simAction.target.id)
      }
      case ACTION_RESOLVE_PROMPT: {
        if (simAction.target) {
          return this.resolveTargetPrompt(simAction.target.id)
        }
        if (simAction.number) {
          return this.resolveNumberPrompt(simAction.number)
        }
        console.log('No transformer for sim action')
        console.dir(simAction)
        break
      }
      default: {
        console.log('No transformer for sim action')
        console.dir(simAction)
        break
      }
    }
  }

  private simulateAttacksQueue(simulationQueue: SimulationEntity[], initialScore: number, opponentId: number) {
    const hashes = new Set<string>()
    let bestAction: {score: number, action: any[] } = {
      score: initialScore,
      action: [this.pass()]
    }
    if (!this.playerId) {
      return this.pass()
    }
    // Simulation itself
    let failsafe = 1000
    let counter = 0
    while (simulationQueue.length && failsafe > 0) {
      failsafe -= 1
      counter += 1
      const workEntity = simulationQueue.pop()
      if (workEntity) {
        try {
          workEntity.sim.update(workEntity.action)
        } catch(e) {
          console.log('Error applying action')
          console.dir(e)
          console.dir(workEntity)
        }
        const score = getStateScore(workEntity.sim, this.playerId, opponentId)
        if (score > bestAction.score) {
          bestAction.score = score
          bestAction.action = workEntity?.actionLog || []
        }
        const hash = this.hashBuilder.makeHash(workEntity.sim)
        if (hashes.has(hash)) {
          continue
        }

        hashes.add(hash)
        const attackPatterns = getAllAttackPatterns(workEntity.sim, this.playerId, opponentId)
        attackPatterns.forEach(pattern => {                
          const sim = workEntity.sim.clone()
          const action = {
            type: ACTION_ATTACK,
            source: sim.getZone(ZONE_TYPE_IN_PLAY).byId(pattern.from),
            target: sim.getZone(ZONE_TYPE_IN_PLAY).byId(pattern.to) || sim.getZone(ZONE_TYPE_ACTIVE_MAGI, opponentId).byId(pattern.to),
            player: this.playerId,
          }
          simulationQueue.push({
            sim,
            action,
            actionLog: [...(workEntity?.actionLog || []), action],
          })
        })
      }
    }
    console.log(`Done ${counter} attack simulations`)
    console.log(`Best found score is ${bestAction.score} (initial is ${initialScore})`)
    return bestAction.action[0]
  }

  private actionToLabel(action: Record<string, any>): string {
    switch (action.type) {
      case ACTION_PLAY: {
        return `PLAY ${action.payload.card.card.name}`
      }
      case ACTION_POWER: {
        return `POWER ${action.source.card.name} ${action.power.name}`
      }
      case ACTION_RESOLVE_PROMPT: {
        return `RESOLVE_PROMPT ${action.target.card.name || action.number}`
      }
    }
    return `Unknown action: ${action.type}`
  }

  private simulateActionsQueue(simulationQueue: SimulationEntity[], initialScore: number, opponentId: number) {
    const hashes = new Set<string>()
    let bestAction: {score: number, action: any[] } = {
      score: initialScore,
      action: []
    }
    if (!this.playerId) {
      return [this.pass()]
    }
    // Simulation itself
    let failsafe = 1000
    let counter = 0
    while (simulationQueue.length && failsafe > 0) {
      failsafe -= 1
      counter += 1
      const workEntity = simulationQueue.pop()
      if (workEntity) {
        try {
          const hashBefore = this.hashBuilder.makeHash(workEntity.sim)
          workEntity.sim.update(workEntity.action)
          const hashAfter = this.hashBuilder.makeHash(workEntity.sim)
          console.log(`  "${hashBefore}" -> "${hashAfter}" [label="${this.actionToLabel(workEntity.action)}"]`)
        } catch(e: any) {
          console.log('Error applying action')
          console.log(`Message: ${e.message}`)
          console.dir(workEntity.action)
        }
        const score = getStateScore(workEntity.sim, this.playerId, opponentId)
        if (score > bestAction.score) {
          bestAction.score = score
          bestAction.action = workEntity.actionLog || []
        }
        const hash = this.hashBuilder.makeHash(workEntity.sim)
        if (hashes.has(hash)) {
          continue
        }

        hashes.add(hash)
        if (workEntity.sim.state.prompt) {
          switch(workEntity.sim.state.promptType) {
            case PROMPT_TYPE_MAY_ABILITY: {
              const actionYes = {
                action: ACTION_RESOLVE_PROMPT,
                promptType: PROMPT_TYPE_MAY_ABILITY,
                generatedBy: workEntity.sim.state.promptGeneratedBy,
                useEffect: true,
                player: workEntity.sim.state.promptPlayer,
              }
              const actionNo = {
                action: ACTION_RESOLVE_PROMPT,
                promptType: PROMPT_TYPE_MAY_ABILITY,
                generatedBy: workEntity.sim.state.promptGeneratedBy,
                useEffect: false,
                player: workEntity.sim.state.promptPlayer,
              }
              simulationQueue.push(
                {
                  sim: workEntity.sim.clone(),
                  action: actionYes,
                  actionLog: [...(workEntity?.actionLog || []), actionYes]
                },
                {
                  sim: workEntity.sim.clone(),
                  action: actionNo,
                  actionLog: [...(workEntity?.actionLog || []), actionNo]
                },
              )
              break;
            }
            case PROMPT_TYPE_SINGLE_CREATURE: {
              const allCreatures: CardInGame[] = workEntity.sim.getZone(ZONE_TYPE_IN_PLAY).cards
                .filter((card: CardInGame) => card.card.type === TYPE_CREATURE)
              allCreatures.forEach(creature => {
                const sim = workEntity.sim.clone()
                const action = {
                  type: ACTION_RESOLVE_PROMPT,
                  promptType: PROMPT_TYPE_OWN_SINGLE_CREATURE,
                  target: sim.getZone(ZONE_TYPE_IN_PLAY).byId(creature.id),
                  generatedBy: sim.state.promptGeneratedBy,
                  playerId: sim.state.promptPlayer,
                }
                simulationQueue.push(
                  {
                    sim,
                    action,
                    actionLog: [...(workEntity?.actionLog || []), action]
                  }
                )
              })
              break;
            }
            case PROMPT_TYPE_NUMBER: {
              const min = workEntity.sim.state.promptParams.min
              const max = workEntity.sim.state.promptParams.max
              if (typeof min === 'number' && typeof max === 'number') {
                for (let i = min; i < max; i++) {
                  const sim = workEntity.sim.clone()
                  const action = {
                    type: ACTION_RESOLVE_PROMPT,
                    promptType: PROMPT_TYPE_NUMBER,
                    number: i,
                    generatedBy: sim.state.promptGeneratedBy,
                    playerId: sim.state.promptPlayer,
                  }
                  simulationQueue.push(
                    {
                      sim,
                      action,
                      actionLog: [...workEntity.actionLog, action]
                    }
                  )
                }
              }
              break;
            }
            case PROMPT_TYPE_OWN_SINGLE_CREATURE: {
              const myCreatures: CardInGame[] = workEntity.sim.getZone(ZONE_TYPE_IN_PLAY).cards
                .filter((card: CardInGame) => card.card.type === TYPE_CREATURE && card.owner === this.playerId)
              myCreatures.forEach(creature => {
                const hashBeforeClone = this.hashBuilder.makeHash(workEntity.sim)
                const sim = workEntity.sim.clone()
                const hashAfterClone = this.hashBuilder.makeHash(sim)
                if (hashBeforeClone !== hashAfterClone) {
                  console.log('')
                  console.log('')
                  console.log(`Hash mismatch on cloning!`)
                  console.log(hashBeforeClone)
                  console.log(hashAfterClone)
                  console.log('Continuing')
                }
                const action = {
                  type: ACTION_RESOLVE_PROMPT,
                  promptType: PROMPT_TYPE_OWN_SINGLE_CREATURE,
                  target: sim.getZone(ZONE_TYPE_IN_PLAY).byId(creature.id),
                  generatedBy: sim.state.promptGeneratedBy,
                  playerId: sim.state.promptPlayer,
                }
                simulationQueue.push(
                  {
                    sim,
                    action,
                    actionLog: [...workEntity.actionLog, action]
                  }
                )
              })
              break;
            }
            case PROMPT_TYPE_SINGLE_MAGI: {
              const myMagi: CardInGame = workEntity.sim.getZone(ZONE_TYPE_ACTIVE_MAGI, this.playerId).card
              if (myMagi) {
                const sim = workEntity.sim.clone()
                const action = {
                  type: ACTION_RESOLVE_PROMPT,
                  promptType: PROMPT_TYPE_SINGLE_MAGI,
                  target: sim.getZone(ZONE_TYPE_ACTIVE_MAGI, this.playerId).card,
                  generatedBy: sim.state.promptGeneratedBy,
                  playerId: sim.state.promptPlayer,
                }
                simulationQueue.push(
                  {
                    sim,
                    action,
                    actionLog: [...workEntity.actionLog, action]
                  }
                )
              }
              const opponentMagi: CardInGame = workEntity.sim.getZone(ZONE_TYPE_ACTIVE_MAGI, opponentId).card
              if (opponentMagi) {
                const sim = workEntity.sim.clone()
                const action = {
                  type: ACTION_RESOLVE_PROMPT,
                  promptType: PROMPT_TYPE_SINGLE_MAGI,
                  target: sim.getZone(ZONE_TYPE_ACTIVE_MAGI, opponentId).card,
                  generatedBy: sim.state.promptGeneratedBy,
                  playerId: sim.state.promptPlayer,
                }
                simulationQueue.push(
                  {
                    sim,
                    action,
                    actionLog: [...workEntity.actionLog, action]
                  }
                )
              }
              break
            }
            default: {
              console.log(`No handler for ${workEntity.sim.state.promptType} prompt types`)
            }
          }
        } else {
          const myCreatures: CardInGame[] = workEntity.sim.getZone(ZONE_TYPE_IN_PLAY).cards.filter((card: CardInGame) => card.owner === this.playerId)
          const creaturesWithPowers = myCreatures.filter(creature => creature.card.data.powers && creature.data.actionsUsed.length === 0)

          creaturesWithPowers.forEach(creature => {
            if (creature.card.data.powers) {
              const sim = workEntity.sim.clone()
              const action = {
                type: ACTION_POWER,
                source: sim.getZone(ZONE_TYPE_IN_PLAY).byId(creature.id),
                power: creature.card.data.powers[0],
                player: this.playerId,
              }
              simulationQueue.push(
                {
                  sim,
                  action,
                  actionLog: [...workEntity.actionLog, action]
                }
              )
            }
          })

          const magiCard: CardInGame = workEntity.sim.getZone(ZONE_TYPE_ACTIVE_MAGI, this.playerId).card
            if (magiCard && magiCard.card.data.powers.length) {
              magiCard.card.data.powers.forEach((power: Record<string, any>) => {
                if (!magiCard.data.actionsUsed.includes(power.name)) {
                  const sim = workEntity.sim.clone()
                  const action = {
                    type: ACTION_POWER,
                    source: sim.getZone(ZONE_TYPE_ACTIVE_MAGI, this.playerId).card,
                    power,
                    player: this.playerId,
                  }
                  simulationQueue.push({
                    sim,
                    action,
                    actionLog: [...workEntity.actionLog, action],
                  })
                }
              })
            }
        }
      }
    }
    console.log('}')
    console.log(`Done ${counter} power simulations`)
    console.log(`Best found score is ${bestAction.score} (initial is ${initialScore})`)
    return bestAction.action
  }

  public requestAction() {
    if (this.actionsOnHold.length) {
      return this.actionsOnHold.shift()
    }

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
        return this.resolveTargetPrompt(this.waitingTarget.target)
      }

      if (this.gameState.playerPriority(this.playerId)) {
        const step = this.gameState.getStep()
        switch(step) {
          case STEP_NAME.PRS1: {
            const playable = this.gameState.getPlayableCards()
              .map(addCardData)
              .filter((card: any) => card._card.type === TYPE_RELIC)
            const relics = this.gameState.getMyRelicsInPlay().map(card => card._card?.name)

            if (playable.some(card => !relics.includes(card._card.name))) {
              const playableRelic = playable.find(card => !relics.includes(card._card.name))
              if (playableRelic) {
                return this.play(playableRelic?.id)
              }
            }

            const playableSpells = this.gameState.getPlayableCards()
              .map(addCardData)
              .filter((card: any) => card._card.type === TYPE_SPELL)

            const TEMPORARY_OPPONENT_ID = this.playerId + 1
            const myMagi = this.gameState.getMyMagi()
            const myCreatures = this.gameState.getMyCreaturesInPlay()
            const myRelics = this.gameState.getMyRelicsInPlay()
            const opponentMagi = this.gameState.getOpponentMagi()

            const enemyCreatures = this.gameState.getEnemyCreaturesInPlay()

            const simulationQueue: SimulationEntity[] = []
            const outerSim = createState([...myCreatures, ...myRelics], enemyCreatures, myMagi, opponentMagi, this.playerId || 1, TEMPORARY_OPPONENT_ID)
            outerSim.state.step = 1
            outerSim.getZone(ZONE_TYPE_HAND, this.playerId).add(playableSpells.map(spell => {
              const card = new CardInGame(byName(spell.card), this.playerId)
              card.id = spell.id
              return card
            }))
            const hash = this.hashBuilder.makeHash(outerSim)
            console.log('digraph sim {')
            console.log(`  "${hash}" []`)
            const initialScore = getStateScore(outerSim, this.playerId, TEMPORARY_OPPONENT_ID)

            const mySimCreatures = (outerSim.getZone(ZONE_TYPE_IN_PLAY).cards as CardInGame[]).filter(card => card.owner === this.playerId)
            const creaturesWithPowers = mySimCreatures.filter(creature => creature.card.data.powers && creature.data.actionsUsed.length === 0)

            const powerActions = creaturesWithPowers.map(card => {
              const power = card.card?.data?.powers ? card.card.data.powers[0] : null 
              if (power) {
                return {
                  type: ACTION_POWER,
                  source: card,
                  power,
                  player: this.playerId,
                }
              }
            }).filter(booleanGuard)

            powerActions.forEach(oldAction => {
              const sim = outerSim.clone()
              const action = {
                ...oldAction,
                source: sim.getZone(ZONE_TYPE_IN_PLAY).byId(oldAction.source.id),
              }
              simulationQueue.push({
                sim,
                action,
                actionLog: [action],
              })
            })
            const magiCard: CardInGame = outerSim.getZone(ZONE_TYPE_ACTIVE_MAGI, this.playerId).card
            if (magiCard && magiCard.card.data.powers && magiCard.card.data.powers.length) {
              magiCard.card.data.powers.forEach((power: Record<string, any>) => {
                const sim = outerSim.clone()
                const action = {
                  type: ACTION_POWER,
                  source: sim.getZone(ZONE_TYPE_ACTIVE_MAGI, this.playerId).card,
                  power,
                  player: this.playerId,
                }
                simulationQueue.push({
                  sim,
                  action,
                  actionLog: [action],
                })
              })
            }
            playableSpells.forEach(spell => {
              const sim = outerSim.clone()
              const card = sim.getZone(ZONE_TYPE_HAND, this.playerId).byId(spell.id)
              if (card) {
                const action = {
                  type: ACTION_PLAY,
                  payload: {
                    card: sim.getZone(ZONE_TYPE_HAND, this.playerId).byId(spell.id),
                    player: this.playerId,
                  }
                }
                simulationQueue.push({
                  sim,
                  action,
                  actionLog: [action],
                })
              }
            })
            const bestActions = this.simulateActionsQueue(simulationQueue, initialScore, TEMPORARY_OPPONENT_ID)
            const finalHash = this.hashBuilder.makeHash(outerSim)
            if (finalHash !== hash) {
              console.log(`Change leak! hashes mismatch: ${hash} => ${finalHash}`)
            }
            console.log(`Best PRS actions:`)
            console.dir(bestActions)

            if (!bestActions[0]) {
              return this.pass()
            }
            this.actionsOnHold = bestActions.slice(1).map(action => this.simulationActionToClientAction(action))
            const bestAction = bestActions[0]
            return this.simulationActionToClientAction(bestAction)
          }

          case STEP_NAME.PRS2: {
            const relics = this.gameState.getMyRelicsInPlay()
            const relicNames = relics.map(card => card._card?.name)
            const enemyCreatures = this.gameState.getEnemyCreaturesInPlay()

            if (relicNames.some(card => card === 'Siphon Stone') && enemyCreatures.some(card => card.data.energy === 1)) {
              const stone = relics.find(card => card.card === 'Siphon Stone')
              if (!stone) return this.pass()
              const target =  enemyCreatures.find(card => card.data.energy === 1) || { id: 'wrong target'}
              stone._card = byName('Siphon Stone')

              if (!stone._card || !stone._card.data.powers?.length) return this.pass()

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
            myMagi._card = byName(myMagi.card) as SimplifiedCard
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

              const enemyCreatures = this.gameState.getEnemyCreaturesInPlay()

              const outerSim = createState(myCreatures, enemyCreatures, myMagi, opponentMagi, this.playerId || 1, TEMPORARY_OPPONENT_ID)
              const attackPatterns = getAllAttackPatterns(outerSim, this.playerId, TEMPORARY_OPPONENT_ID)
              // const hashes = new Set<string>()
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

              const bestAction = this.simulateAttacksQueue(simulationQueue, initialScore, TEMPORARY_OPPONENT_ID)
              if (bestAction.type === ACTION_ATTACK) {
                return this.simulationActionToClientAction(bestAction)
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