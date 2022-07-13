import {byName} from 'moonlands/dist/cards'
import {ACTION_ATTACK, ACTION_PLAY, ACTION_RESOLVE_PROMPT, PROMPT_TYPE_CHOOSE_CARDS, TYPE_CREATURE, TYPE_RELIC} from './const';
import {DragonlandService} from './DragonlandService'
import { GameConnector } from './GameConnector'
import { GameState } from './GameState';
import { RandomStrategy } from './RandomStrategy';

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
  const gameHash = await dragonlandService.acceptChallenge(challenges[0].user, RandomStrategy.deckId)
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

  const strategy = new RandomStrategy(io)

  setInterval(() => {
    console.log('keepalive')
    strategy.requestAction()
  }, 800)
}

play()