import { GameState } from "./GameState.js"
import { Strategy } from './strategies/Strategy.js'
import { ErrorDumpService } from './diagnostics.js'

export class WorkerStrategyConnector {
  private playerId?: number
  private gameState?: GameState
  private strategy?: Strategy
  public constructor() { }

  public connect(strategy: Strategy) {
    this.strategy = strategy

    onmessage = (message) => {
      if (message.data.type === 'special/setup' && message.data.playerId > 0) {
        this.playerId = message.data.playerId as number
        this.gameState = new GameState(message.data.state)
        this.gameState.setPlayerId(message.data.playerId)

        strategy.setup(this.gameState, this.playerId)
        console.log('We got the game data')
        console.log(`We are player ${this.playerId}`)
        if (this.gameState.playerPriority(this.playerId) || this.gameState.isInPromptState(this.playerId)) {
          this.requestAndSendAction()
        }
      } else {
        const action = message.data;
        if (this.gameState && this.playerId && action) {
          try {
            const stateBefore = JSON.parse(JSON.stringify(this.gameState.state))
            this.gameState.update(action)
          } catch (e: any) {
            console.log('Error applying the action')
            console.dir(action)
            console.log(e?.message)
            try {
              ErrorDumpService.dumpActionFailure(action, (this.gameState && this.gameState.state) ? JSON.parse(JSON.stringify(this.gameState.state)) : null, e, { location: 'WorkerStrategyConnector', playerId: this.playerId })
            } catch (_err) {
              // ignore
            }
          }

          if (this.gameState.hasGameEnded()) {
            console.log(this.gameState.getWinner() === this.playerId ? 'We won' : 'We lost');
            close();
            // process.exit(0);
            return true;
          }

          if (action.type === 'display/status') {
            console.log(`State dump`)
            console.dir(this.gameState.state);
          }
          if (action.type === 'display/priority') {
            if (action.player === this.playerId) {
              this.requestAndSendAction()
            }
          }
        }

      }
    }
  }

  private requestAndSendAction() {
    if (!this.gameState || !this.playerId || !this.strategy) {
      return
    }
    // Prompts can interrupt any step, including Draw and the opponent's turn.
    // The strategy already handles prompt resolution; do not restrict it to Gar.
    const inPromptState = this.gameState.isInPromptState(this.playerId)
    const canAct = this.gameState.playerPriority(this.playerId) && !this.gameState.state.prompt && this.gameState.getStep() !== 5
    if (inPromptState || canAct) {
      const action = this.strategy.requestAction()
      if (action) {
        postMessage(action)
      } else {
        console.log('No action returned from request')
      }
    }
  }
}
