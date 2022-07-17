import {Socket} from "socket.io-client"
import { GameState } from "./GameState"
import {Strategy} from './Strategy'

export const debounce = <F extends (...args: any[]) => any>(func: F, waitFor: number) => {
  let timeout: NodeJS.Timeout

  return (...args: Parameters<F>): Promise<ReturnType<F>> =>
    new Promise(resolve => {
      if (timeout) {
        clearTimeout(timeout)
      }

      timeout = setTimeout(() => resolve(func(...args)), waitFor)
    })
}

export class StrategyConnector {
  private playerId?: number
  private gameState?: GameState
  private strategy?: Strategy
  public constructor(private readonly io: Socket) {}

  public connect(strategy: Strategy) {
    this.strategy = strategy
    const dRequestAction = debounce(this.requestAndSendAction.bind(this), 200)

    this.io.on('gameData', (data: {playerId: number, state: any}) => {
      this.playerId = data.playerId
      this.gameState = new GameState(data.state)
      this.gameState.setPlayerId(data.playerId)

      strategy.setup(this.gameState, this.playerId)
      console.log('We got the game data')
      if (this.gameState.playerPriority(this.playerId) || this.gameState.isInPromptState(this.playerId)) {
        dRequestAction()
      }
    })

    this.io.on('action', action => {
      if (this.gameState && this.playerId) {
        try {
        this.gameState.update(action)
        } catch(e: any) {
          console.log('Error applying the action')
          console.dir(action)
          console.log(e?.message)
        }

        if (this.gameState.playerPriority(this.playerId) || this.gameState.isInPromptState(this.playerId)) {
          dRequestAction()
        }
      }
    })
  }

  private requestAndSendAction() {
    if (this.strategy && this.gameState && this.playerId &&
        (this.gameState.playerPriority(this.playerId) || this.gameState.isInPromptState(this.playerId))) {
      console.log('Requesting action')
      const action = this.strategy.requestAction()
      console.log('Action received:')
      console.dir(action)
      this.io.emit('clientAction', action)
    }
  }
}