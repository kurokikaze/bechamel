export interface DiagnosticReporter {
  dumpActionFailure(action: any, stateBefore: any, error: any, context?: any): unknown;
  dumpGameState(state: any, context?: any): unknown;
}

let reporter: DiagnosticReporter = {
  dumpActionFailure: (action, stateBefore, error, context) => console.error('Bot action failed', { action, stateBefore, error, context }),
  dumpGameState: (state, context) => console.error('Bot state dump', { state, context }),
};

export function configureDiagnostics(value: DiagnosticReporter): void { reporter = value; }
export const ErrorDumpService: DiagnosticReporter = {
  dumpActionFailure: (...args) => reporter.dumpActionFailure(...args),
  dumpGameState: (...args) => reporter.dumpGameState(...args),
};
