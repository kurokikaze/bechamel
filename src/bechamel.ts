import {DragonlandService} from './DragonlandService'
import { GameConnector } from './GameConnector'
// import { RandomStrategy } from './strategies/RandomStrategy';
import { SimulationStrategy } from './strategies/SimulationStrategy';
import { StrategyConnector } from './StrategyConnector';

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

async function play() {
  const dragonlandService = new DragonlandService('http://localhost:3000')

  await dragonlandService.login('tester4', 'testing')
  const challenges = await dragonlandService.getChallenges()
  console.dir(challenges)
  if (!challenges || !challenges.length) {
    console.log("No challenges")
  }
  console.log(`Ready to accept challenge ${challenges[0].deckId}:${challenges[0].user}`)
  const gameHash = await dragonlandService.acceptChallenge(challenges[0].user, SimulationStrategy.deckId)
  console.log(`Started game ${gameHash}`)

  if (!gameHash) {
    return false
  }

  await dragonlandService.accessGame(gameHash)

  await timeout(300) // Just in case

  const connector = new GameConnector('http://localhost:3000')
  const io = connector.connect(gameHash)

  io.on('connect', () => {
    console.log('Connected, id is ', io.id)
  })

  const strategyConnector = new StrategyConnector(io)

  strategyConnector.connect(new SimulationStrategy())
}

play()