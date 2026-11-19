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
| `bechamel` | GameState, SimulationStrategy, RandomStrategy, Strategy and state types, configureDiagnostics |
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

## Simulation and triage

The existing simulation tests and deck-vs-deck harness now run here:

```sh
npm run build
npm run sim:harness -- --runs=1 --baseSeed=2053
```

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

## Distribution

Build before packing; only `dist/` and package metadata/documentation ship.
Duel-protocol 0.1.0 is installed from the compiled `.tgz` attached to its GitHub
Release: https://github.com/kurokikaze/duel-protocol/releases/tag/0.1.0.
The lockfiles record the archive integrity. Publish changed protocol code under
a new version and update the archive URL in both consumers; do not replace an
existing release asset in place. No npm registry publication is required.
Waystone still uses `file:../bechamel` until Bechamel has its own release artifact.
