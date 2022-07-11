import { ACTION_RESOLVE_PROMPT, PROMPT_TYPE_CHOOSE_CARDS } from './const';
import { DragonlandService } from './DragonlandService'
import { GameConnector } from './GameConnector'
import { GameState } from './GameState';

function timeout(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const NAROOM_DECK = '5f60e45e11283f7c98d9259b'
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


  setInterval(() => {
    console.log('keepalive')
    if (gameState && playerId) {
      if (gameState.playerPriority(playerId)) {
        io.emit('clientAction', {
          type: 'actions/pass',
          player: playerId,
        })
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
  }, 5000)
}

play()