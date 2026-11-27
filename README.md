# Bechamel

Magi-Nation Duel bot, extracted from Waystone. Requires Node.js 18 or newer.

The package contains the bot's client-state model, action search, simulation and
recon strategies, Socket.IO connector, and Web Worker connector. It has no React,
Redux, Tauri, or Waystone dependency.

## Local development

Keep `bechamel` and `waystone` in sibling directories. The compiled protocol is
installed from its GitHub Release archive; a local protocol checkout is optional.
Build the bot before the application:

```sh
cd ../bechamel
npm ci
npm run build
npm test
cd ../waystone
npm install
npm run build
```

`moonlands` is a peer dependency so the consuming application/server controls the
engine version. Development uses the same v0.40.2 engine archive as Waystone.
Do not update the engine as part of the extraction. Keep the engine versions in
all consumers aligned. The sibling `moonlands` working tree is unchanged.

## Public entry points

| Import | Contents |
| --- | --- |
| `bechamel` | BotSession, BotMessage, GameState, SimulationStrategy, RandomStrategy, Strategy and state types, configureDiagnostics |
| `bechamel/worker` | WorkerStrategyConnector; browser worker globals are used when connected |
| `bechamel/node` | StrategyConnector, GameConnector, ReconSimulationStrategy (uses Node crypto) |
| `bechamel/simulation` | Simulation class and its configuration/result types |
| `bechamel/simulation-utils` | State reconstruction helpers |

The root entry point does not start a game, register a worker message handler, or
import the Node-only recon strategy. The historical login CLI remains available
through `npm start -- <username> <deckId>`; it still targets the local legacy server.

Diagnostic reporting defaults to console output. Hosts can call
`configureDiagnostics({ dumpActionFailure, dumpGameState })` to supply persistence.
Waystone injects its existing Tauri-aware ErrorDumpService inside the bot worker.

## Shared bot protocol endpoint

`BotSession` owns the player's client state and the strategy. Waystone's
`WorkerStrategyConnector`, the legacy Socket.IO `StrategyConnector`, and triage
all use this endpoint. Transports do not implement their own prompt handlers.

`session.handleMessage(message)` accepts the same messages in every host:

- `special/setup` with `playerId` and that player's serialized state initializes
  the strategy and may return its opening action.
- Protocol events update the client state without requesting an action.
- `display/priority` with the player's ID requests an action after the engine
  finishes its event sequence. Prompts take precedence over normal turn control,
  including Draw Step and prompts during the opponent's turn.

The result is an outgoing protocol action or `null` when no action is due.
The host must forward the opening action too. The legacy synchronous Socket.IO
harness buffers it until `requestAndSendAction()` so both players can finish
initializing before an outgoing action re-enters the engine.

An eligible strategy returning no action, an action for another player, or a
non-prompt action during a prompt produces an error and diagnostic report in
every host. Strategy/state-update exceptions propagate rather than being hidden.
The shared root module uses no worker globals, Node-only imports or networking.

Regression tests run Fossik, Gar, and Giant Vulbor through worker, headless and
Socket.IO adapters. Triage still owns deterministic seeds, package isolation,
engine execution, time limits, logs and MongoDB persistence.

## Simulation and triage

The existing simulation tests and deck-vs-deck harness now run here:

```sh
npm run build
npm run sim:harness -- --runs=1 --baseSeed=2053
```

The legacy harness also accepts `--writeLogs=true` and, with `--strategy=recon`,
`--writeExtractionHashes=true`. Replay snapshots and ordered extraction hash pairs
are written under `--outputDir` (default `stateDumps`), including partial output
when a run fails or reaches its iteration limit.

The harness writes summaries into `stateDumps/`. Its configuration and accepted
options are in `src/tests/simulationHarness.ts`. Use `bechamel/simulation` for
legacy programmatic execution. The sibling [triage server](../triage/README.md)
now provides HTTP batches, deterministic sampling, engine-version isolation,
custom cards and MongoDB persistence. It uses the bot's public state/strategy APIs
without depending on this old harness, which remains for compatibility.
The search simulations inside strategies remain bot implementation details;
they are needed for local offline play and do not depend on the triage server.

`src/tests/support/createGame.ts` is a test fixture, not a second production server.
The production local engine host remains in Waystone.

## Attack control

Both strategies support controlling another player's attack step (Will of
Orothe). Search preserves the turn owner, enumerates that player's attackers,
and evaluates combat from the bot's perspective. Passing remains an option
unless an attack is mandatory. At the attack step, normal engine simulation
handles interactions such as sacrificing an enemy attacker to Bwill's Karma.

Before that step, the evaluation uses a discounted estimate of attacks prevented
and enemies that could be traded into Bwill. This helps decide whether to cast
Will; it does not predict the opponent's intervening spells or powers. The
forecast is removed once the controlled attack step begins, so actual combat
and the predicted benefit are not counted together.

## Distribution

Build before packing; only `dist/` and package metadata/documentation ship.
Duel-protocol 0.1.0 is installed from the compiled `.tgz` attached to its GitHub
Release: https://github.com/kurokikaze/duel-protocol/releases/tag/0.1.0.
The lockfiles record the archive integrity. Publish changed protocol code under
a new version and update the archive URL in both consumers; do not replace an
existing release asset in place. No npm registry publication is required.
Waystone still uses `file:../bechamel` until Bechamel has its own release artifact.
