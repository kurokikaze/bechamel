import type { Socket } from 'socket.io-client';
import type { C2SAction } from 'duel-protocol';
import { BotSession, type BotMessage } from './BotSession.js';
import type { Strategy } from './strategies/Strategy.js';
import type { SerializedClientState } from './types.js';

/** Legacy Socket.IO transport, also used by the standalone simulation harness. */
export class StrategyConnector {
  private session?: BotSession;
  private playerId?: number;
  private pending: C2SAction | null = null;

  constructor(private readonly io: Socket) {}

  public connect(strategy: Strategy) {
    const session = this.session = new BotSession(strategy);
    this.io.on('gameData', (data: { playerId: number; state: SerializedClientState }) => {
      this.playerId = data.playerId;
      // The synchronous harness must finish setting up both players before
      // an outgoing command can re-enter the engine. Keep its explicit pull API.
      this.pending = session.handleMessage({ type: 'special/setup', ...data });
    });
    this.io.on('action', (message: BotMessage) => {
      if (message?.type === 'display/priority') {
        if (message.player === this.playerId) this.requestAndSendAction();
        return;
      }
      session.handleMessage(message);
      if (session.gameState?.hasGameEnded()) this.io.close();
    });
  }

  public requestAndSendAction() {
    if (!this.session || this.playerId === undefined) return;
    const action = this.pending ?? this.session.handleMessage({ type: 'display/priority', player: this.playerId });
    this.pending = null;
    if (action) this.io.emit('clientAction', action, this.session.gameState?.state);
  }
}
