import { ACTION_PASS } from "moonlands/dist/esm/const.js";
import { C2SAction } from 'duel-protocol';
import { GameState } from "../GameState.js";

export abstract class Strategy {
  constructor() {}
  public setup(state: GameState, playerId: number) {}
  public requestAction(): C2SAction { return {type: ACTION_PASS, player: 1}}
  public requestHistory(): any[] { return [] }
}