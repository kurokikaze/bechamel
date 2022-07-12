import {byName} from 'moonlands/dist/cards'
import {ACTION_ATTACK, ACTION_PLAY, ACTION_RESOLVE_PROMPT, PROMPT_TYPE_CHOOSE_CARDS, TYPE_CREATURE, TYPE_RELIC} from './const';
import {DragonlandService} from './DragonlandService'
import { GameConnector } from './GameConnector'
import { GameState } from './GameState';

const STEP_NAME = {
  ENERGIZE: 0,
  PRS1: 1,
  ATTACK: 2,
  CREATURES: 3,
  PRS2: 4,
  DRAW: 5,
}

function timeout(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const NAROOM_DECK = '5f60e45e11283f7c98d9259b'

const addCardData = (card: any) => ({
  ...card,
  _card: byName(card.card),
})

async function play() {
  const dragonlandService = new DragonlandService('http://localhost:3000')

  await dragonlandService.login('tester4', 'testing')
  const challenges = await dragonlandService.getChallenges()
  console.dir(challenges)
  if (!challenges || !challenges.length) {
    console.log("No challenges")
  }
  console.log(`Ready to accept challenge ${challenges[0].deckId}:${challenges[0].user}`)
  const gameHash = await dragonlandService.acceptChallenge(challenges[0].user, NAROOM_DECK)
  console.log(`Started game ${gameHash}`)

  if (!gameHash) {
    return false
  }

  await dragonlandService.accessGame(gameHash)

  await timeout(300) // Just in case

  const connector = new GameConnector('http://localhost:3000')
  const io = connector.connect(gameHash)

  let gameState: GameState | null = null
  let playerId: number | null = null
  io.on('connect', () => {
    console.log('Connected, id is ', io.id)

    io.on('gameData', data => {
      console.log('GameData received')
      console.dir(data)
      playerId = data.playerId
      gameState = new GameState(data.state)
      gameState.setPlayerId(data.playerId)
    })

    io.on('action', action => {
      if (gameState) {
        gameState.update(action)
      }
    })

    io.on('clientAction', a => {
      console.log('ClientAction')
      console.dir(a)
    })

    io.emit('clientAction', {
      type: 'actions/pass',
      player: 1000,
    })
  })


  const pass = () => {
    io.emit('clientAction', {
      type: 'actions/pass',
      player: playerId,
    })
  }

  const play = (cardId: string) => {
    io.emit('clientAction', {
      type: ACTION_PLAY,
      payload: {
        card: cardId,
        player: playerId,
      }
    })
  }

  const attack = (from: string, to: string) => {
    io.emit('clientAction', {
      type: ACTION_ATTACK,
      source: from,
      target: to,
      player: playerId,
    })
  }

  setInterval(() => {
    console.log('keepalive')
    if (gameState && playerId) {
      if (gameState.playerPriority(playerId)) {
        const step = gameState.getStep()
        switch(step) {
          case STEP_NAME.PRS1: {
            console.dir(gameState.getPlayableCards())
            console.dir(byName('Water of Life'))
            const playable = gameState.getPlayableCards()
              .map(addCardData)
              .filter(card => card._card.type === TYPE_RELIC)
            const relics = gameState.getMyRelicsInPlay().map(card => card._card.name)

            if (playable.some(card => !relics.includes(card._card.name))) {
              const playableRelic = playable.find(card => !relics.includes(card._card.name))
              if (playableRelic) {
                play(playableRelic?.id)
              } else {
                pass()
              }
            } else {
              pass()
            }
            break
          }
          case STEP_NAME.CREATURES: {
            const availableEnergy = gameState.getMyMagi().data.energy
            const playable = gameState.getPlayableCards()
              .map(addCardData)
              .filter(card => card._card.type === TYPE_CREATURE && card._card.cost && card._card.cost < availableEnergy)
            if (playable.length) {
              const playableCreature = playable[0]
              play(playableCreature.id)
            } else {
              pass()
            }
            break;
          }
          case STEP_NAME.ATTACK: {
            const myCreatures = gameState.getMyCreaturesInPlay().filter(creature => creature.data.attacked == 0)
            const enemyCreatures = gameState.getEnemyCreaturesInPlay()
            const opponentMagi = gameState.getOpponentMagi()
            if (myCreatures.length) {
              const randomMy = myCreatures[Math.floor(Math.random() * myCreatures.length)]
              if (enemyCreatures.length) {
                const randomOpponent = enemyCreatures[Math.floor(Math.random() * enemyCreatures.length)]
                attack(randomMy.id, randomOpponent.id)
              } else if (opponentMagi.id) {
                attack(randomMy.id, opponentMagi.id)
              } else {
                pass()
              }
            } else {
              pass()
            }
            break;
          }
          default:
            io.emit('clientAction', {
              type: 'actions/pass',
              player: playerId,
            })
        }        
      }

      if (gameState.waitingForCardSelection()) {
        io.emit('clientAction', {
          type: ACTION_RESOLVE_PROMPT,
          promptType: PROMPT_TYPE_CHOOSE_CARDS,
          cards: gameState.getStartingCards(),
          player: playerId,
        })
      }
    }
  }, 800)
}

play()