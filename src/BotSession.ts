import { ACTION_RESOLVE_PROMPT } from 'moonlands/dist/esm/const.js';
import type { C2SAction, ClientAction } from 'duel-protocol';
import { GameState } from './GameState.js';
import type { Strategy } from './strategies/Strategy.js';
import type { SerializedClientState } from './types.js';
import { ErrorDumpService } from './diagnostics.js';

export type BotMessage = ClientAction
  | { type: 'special/setup'; playerId: number; state: SerializedClientState }
  | { type: 'display/priority'; player: number }
  | { type: 'display/status' };

/** Shared browser/headless endpoint. Apply the complete engine event sequence
 * before display/priority; ordinary events never request actions mid-update. */
export class BotSession {
  public gameState?: GameState;
  private playerId?: number;

  constructor(private readonly strategy: Strategy) {}

  public handleMessage(message: BotMessage): C2SAction | null {
    if (!message) return null;
    try {
      if (message.type === 'special/setup') {
        if (!Number.isInteger(message.playerId) || message.playerId <= 0) throw new Error('Invalid bot player ID');
        this.playerId = message.playerId;
        this.gameState = new GameState(message.state);
        this.gameState.setPlayerId(message.playerId);
        this.strategy.setup(this.gameState, message.playerId);
        return this.requestAction();
      }
      if (!this.gameState || this.playerId === undefined) return null;
      this.gameState.update(message);
      if (message.type === 'display/status') console.dir(this.gameState.state);
      if (message.type === 'display/priority' && message.player === this.playerId) return this.requestAction();
      return null;
    } catch (error) {
      // Stop on a broken state instead of continuing with a partially updated view.
      try {
        const result = ErrorDumpService.dumpActionFailure(message, this.gameState?.state, error,
          { location: 'BotSession', playerId: this.playerId });
        if (result instanceof Promise) void result.catch(() => {});
      } catch { /* Preserve the original failure if reporting fails. */ }
      throw error;
    }
  }

  private requestAction(): C2SAction | null {
    const state = this.gameState;
    if (!state || this.playerId === undefined || state.hasGameEnded()) return null;
    const inPrompt = state.isInPromptState(this.playerId);
    const canAct = !state.state.prompt && state.playerPriority(this.playerId) && state.getStep() !== 5;
    if (!inPrompt && !canAct) return null;

    const action = this.strategy.requestAction();
    if (!action) throw new Error(`Bot ${this.playerId} returned no action`);
    if ('player' in action && action.player !== this.playerId) throw new Error(`Bot ${this.playerId} returned an action for player ${action.player}`);
    if (inPrompt && action.type !== ACTION_RESOLVE_PROMPT) throw new Error(`Bot ${this.playerId} returned a non-prompt action during ${state.getPromptType()}`);
    if (!inPrompt && action.type === ACTION_RESOLVE_PROMPT) throw new Error(`Bot ${this.playerId} resolved a prompt outside a prompt state`);
    return action;
  }
}
