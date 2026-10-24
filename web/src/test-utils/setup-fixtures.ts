import type { SetupReport, SetupStep, SetupStepId } from '../api/setup-types.ts';

const OK_STEPS: readonly SetupStep[] = [
  { id: 'omniroute', status: 'ok', detail: '2 models at http://127.0.0.1:20128/v1', facts: { kind: 'router', url: 'http://127.0.0.1:20128/v1', models: 2 } },
  { id: 'apiKey', status: 'ok', detail: 'set and accepted', facts: { kind: 'keyAccepted' } },
  { id: 'model', status: 'ok', detail: 'a/model answered in 420 ms', facts: { kind: 'modelAnswered', model: 'a/model', ms: 420 } },
  { id: 'kbagent', status: 'ok', detail: 'kbagent v0.100.2', facts: { kind: 'version', version: 'kbagent v0.100.2' } },
  { id: 'projects', status: 'ok', detail: '1 registered: sandbox', facts: { kind: 'projects', aliases: ['sandbox'] } },
  { id: 'project', status: 'ok', detail: 'sandbox (kbagent default)', facts: { kind: 'project', alias: 'sandbox', source: 'default' } },
];

/** Everything set up, like a working install. */
export const SETUP_COMPLETE: SetupReport = {
  steps: OK_STEPS,
  complete: true,
  models: ['a/model', 'b/model'],
  projects: [{ alias: 'sandbox', name: 'Sandbox', id: 6487, stackUrl: 'https://connection.keboola.com', isDefault: true }],
  omniroute: { baseUrl: 'http://127.0.0.1:20128/v1', apiKeySet: true },
  effective: { model: 'a/model', keboolaProject: '' },
};

/** A report with some steps replaced; `complete` follows the steps. */
export function setupReport(steps: Partial<Record<SetupStepId, Omit<SetupStep, 'id'>>>, rest: Partial<SetupReport> = {}): SetupReport {
  const merged = OK_STEPS.map((step) => {
    const change = steps[step.id];
    return change ? { id: step.id, ...change } : step;
  });
  return { ...SETUP_COMPLETE, ...rest, steps: merged, complete: merged.every((step) => step.status === 'ok') };
}
