/**
 * The setup wizard behind /api/setup: the checklist with a remembered model test (a completion costs
 * tokens and seconds), and the write-only OmniRoute key that goes to .env and into use without a restart.
 */
import { createHash } from 'node:crypto';
import type { OmniRouteConfig } from '../config/env.ts';
import type { KeboolaProject } from '../system/keboola.ts';
import type { KeboolaAccess } from '../system/keboola-access.ts';
import { runSetupChecks, type SetupChecks } from './checks.ts';
import { writeEnvValues } from './env-file.ts';
import { type ModelTestResult, probeOmniRoute, testModel } from './omniroute.ts';

/** What the UI may know about OmniRoute settings: the address, and only whether a key is set. */
export interface OmniRouteState {
  readonly baseUrl: string;
  readonly apiKeySet: boolean;
}

export interface SetupReport extends SetupChecks {
  readonly omniroute: OmniRouteState;
  /** The model and Keboola project in use (settings override .env); empty when not chosen. */
  readonly effective: { readonly model: string; readonly keboolaProject: string };
}

export interface OmniRouteInput {
  readonly apiKey: string;
  readonly baseUrl?: string | undefined;
}

export interface SetupService {
  /** Run the checklist; `retest` tests a model again whose last test failed. */
  report(options?: { retest?: boolean }): Promise<SetupReport>;
  /** Test the model in use now, whatever the last result was. */
  testModel(): Promise<ModelTestResult>;
  /** Save the key (and address) to .env and start using them. Throws when .env cannot be written. */
  saveOmniRoute(input: OmniRouteInput): OmniRouteState;
}

export interface SetupServiceDeps {
  readonly envFile: string;
  /** Where a missing .env starts from (.env.example). */
  readonly envTemplate?: string;
  /** OmniRoute settings in use, and the model and Keboola project after settings overrides. */
  readonly current: () => { readonly omniroute: OmniRouteConfig; readonly model: string; readonly keboolaProject: string };
  readonly kbagentVersion: () => Promise<string>;
  readonly keboolaProjects: () => Promise<readonly KeboolaProject[]>;
  /** The analyst's access in the chosen project; adds the access step to the checklist. */
  readonly keboolaAccess?: () => Promise<KeboolaAccess>;
  /** Where kbagent reads its config, for the projects step when it finds none. */
  readonly kbagentConfig?: () => Promise<string | undefined>;
  /** Start using new OmniRoute settings: rebuild the model factory and the team. */
  readonly apply: (omniroute: OmniRouteConfig) => void;
  readonly fetchImpl?: typeof fetch;
}

const MAX_REMEMBERED = 20;

/** Remembered per address, model and key; the key itself is only kept as a hash. */
const testId = ({ baseUrl, model, apiKey }: OmniRouteConfig) => `${baseUrl}\n${model}\n${createHash('sha256').update(apiKey).digest('hex')}`;

export function createSetupService(deps: SetupServiceDeps): SetupService {
  const fetchImpl = deps.fetchImpl ?? fetch;
  // Tests by testId: running or done, and the results of those that are done.
  const tests = new Map<string, Promise<ModelTestResult>>();
  const results = new Map<string, ModelTestResult>();
  const inUse = (): OmniRouteConfig => {
    const { omniroute, model } = deps.current();
    return { ...omniroute, model };
  };

  const startTest = (config: OmniRouteConfig): Promise<ModelTestResult> => {
    const id = testId(config);
    const pending = testModel(config, { fetchImpl });
    tests.delete(id);
    results.delete(id);
    const oldest = tests.keys().next().value;
    if (tests.size >= MAX_REMEMBERED && oldest !== undefined) {
      tests.delete(oldest);
      results.delete(oldest);
    }
    tests.set(id, pending);
    // testModel never rejects. A newer test of the same model wins over this one.
    void pending.then((result) => tests.get(id) === pending && results.set(id, result));
    return pending;
  };

  const state = (): OmniRouteState => {
    const { baseUrl, apiKey } = deps.current().omniroute;
    return { baseUrl, apiKeySet: apiKey !== '' };
  };

  return {
    async report({ retest = false } = {}) {
      const config = inUse();
      const { keboolaProject } = deps.current();
      const id = testId(config);
      // Looked up when the checks get to the model, so reports running side by side share one test.
      const remembered = () => {
        const known = tests.get(id);
        return known && !(retest && results.get(id)?.ok === false) ? known : undefined;
      };
      const checks = await runSetupChecks({
        omniroute: config,
        keboolaProject,
        probeOmniRoute: () => probeOmniRoute(config, fetchImpl),
        testModel: () => remembered() ?? startTest(config),
        kbagentVersion: deps.kbagentVersion,
        keboolaProjects: deps.keboolaProjects,
        ...(deps.keboolaAccess ? { keboolaAccess: deps.keboolaAccess } : {}),
        ...(deps.kbagentConfig ? { kbagentConfig: deps.kbagentConfig } : {}),
      });
      return { ...checks, omniroute: state(), effective: { model: config.model, keboolaProject } };
    },

    testModel: () => startTest(inUse()),

    saveOmniRoute({ apiKey, baseUrl }) {
      const address = baseUrl?.trim().replace(/\/+$/, '');
      writeEnvValues(deps.envFile, { OMNIROUTE_API_KEY: apiKey, ...(address ? { OMNIROUTE_BASE_URL: address } : {}) }, {
        ...(deps.envTemplate === undefined ? {} : { template: deps.envTemplate }),
      });
      deps.apply({ ...deps.current().omniroute, apiKey, ...(address ? { baseUrl: address } : {}) });
      return state();
    },
  };
}
