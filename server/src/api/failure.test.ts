import { describe, expect, it } from 'vitest';
import { describeFailure } from './failure.ts';

const apiError = (status: number | undefined, message: string) =>
  Object.assign(new Error(message), { status, headers: new Headers(), error: { message } });

describe('describeFailure', () => {
  it('reports a run the user stopped as stopped, whatever error the abort raised', () => {
    expect(describeFailure(new Error('This operation was aborted'), { stopped: true })).toEqual({ reason: 'stopped', error: 'Stopped by the user' });
  });

  it('tells an unavailable model from one that refused the request', () => {
    expect(describeFailure(apiError(503, '503 upstream overloaded'), { stopped: false })).toEqual({
      reason: 'model_unavailable',
      error: '503 upstream overloaded',
    });
    expect(describeFailure(apiError(undefined, 'overloaded'), { stopped: false }).reason).toBe('model_unavailable');
    expect(describeFailure(apiError(401, '401 Invalid API key'), { stopped: false }).reason).toBe('model_rejected');
  });

  it('drops the LangChain troubleshooting link from the message', () => {
    const error = apiError(429, '429 Rate limit reached\n\nTroubleshooting URL: https://docs.langchain.com/oss/javascript/langchain/errors/MODEL_RATE_LIMIT/\n');
    expect(describeFailure(error, { stopped: false })).toEqual({ reason: 'model_unavailable', error: '429 Rate limit reached' });
  });

  it('recognises the step limit', () => {
    const error = Object.assign(new Error('Recursion limit of 200 reached without hitting a stop condition.'), { name: 'GraphRecursionError' });
    expect(describeFailure(error, { stopped: false }).reason).toBe('step_limit');
  });

  it('passes other errors on as they are, cut to a readable length', () => {
    expect(describeFailure(new Error('kbagent exited with code 2'), { stopped: false })).toEqual({ reason: 'error', error: 'kbagent exited with code 2' });
    expect(describeFailure('plain', { stopped: false })).toEqual({ reason: 'error', error: 'plain' });
    expect(describeFailure(new Error('x'.repeat(2000)), { stopped: false }).error.length).toBeLessThanOrEqual(500);
    expect(describeFailure(new Error(''), { stopped: false }).error).toBe('Unknown error');
  });
});
