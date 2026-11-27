import { BotSession } from './BotSession.js';
import type { Strategy } from './strategies/Strategy.js';

/** Browser transport only; state and prompt handling live in BotSession. */
export class WorkerStrategyConnector {
  public connect(strategy: Strategy) {
    const session = new BotSession(strategy);
    onmessage = ({ data }) => {
      const action = session.handleMessage(data);
      if (session.gameState?.hasGameEnded()) close();
      else if (action) postMessage(action);
    };
  }
}
