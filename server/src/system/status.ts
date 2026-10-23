export interface Check {
  readonly ok: boolean;
  readonly detail: string;
}

export interface SystemStatus {
  readonly app: Check;
  readonly node: Check;
  readonly omniroute: Check;
  readonly model: Check;
  readonly kbagent: Check;
}

const failure = (error: unknown): Check => ({ ok: false, detail: error instanceof Error ? error.message : String(error) });

/** Same checks as `npm run doctor`, for the Settings page. Each part fails on its own. */
export async function systemStatus({ version, models, kbagent, model }: {
  version: string;
  models: () => Promise<readonly string[]>;
  kbagent: () => Promise<string>;
  model: string;
}): Promise<SystemStatus> {
  const [modelList, kbagentResult] = await Promise.allSettled([models(), kbagent()]);
  const ids = modelList.status === 'fulfilled' ? modelList.value : undefined;

  const modelCheck: Check = !model
    ? { ok: false, detail: 'not set' }
    : ids && !ids.includes(model)
      ? { ok: false, detail: `${model} (not listed by OmniRoute)` }
      : { ok: true, detail: model };

  return {
    app: { ok: true, detail: version },
    node: { ok: true, detail: process.version },
    omniroute: ids ? { ok: true, detail: `${ids.length} models` } : failure((modelList as PromiseRejectedResult).reason),
    model: modelCheck,
    kbagent: kbagentResult.status === 'fulfilled' ? { ok: true, detail: kbagentResult.value } : failure(kbagentResult.reason),
  };
}
