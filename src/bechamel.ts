import { DragonlandService } from "./DragonlandService";

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
}

play()