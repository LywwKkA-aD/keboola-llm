import { describe, expect, it } from 'vitest';
import { createModelFactory } from './model.ts';

const config = { baseUrl: 'http://127.0.0.1:20128/v1', apiKey: 'test-key', model: 'cc/default' };

describe('createModelFactory', () => {
  it('builds models without a key, so the app starts and the setup wizard can ask for one', async () => {
    const model = createModelFactory({ ...config, apiKey: '' })();
    expect(model.model).toBe('cc/default');
    await expect(model.invoke('hi')).rejects.toThrow(/OMNIROUTE_API_KEY is not set/);
  });

  it('builds a model without a model id that asks to choose one when called', async () => {
    const model = createModelFactory({ ...config, model: '' })();
    await expect(model.invoke('hi')).rejects.toThrow(/No model is chosen/);
  });

  it('points the OpenAI client at OmniRoute with the keepalive filter', () => {
    const model = createModelFactory(config)();
    expect(model.model).toBe('cc/default');
    expect(model.streaming).toBe(true);
    expect(model.clientConfig.baseURL).toBe('http://127.0.0.1:20128/v1');
    expect(typeof model.clientConfig.fetch).toBe('function');
  });

  it('reuses one client per model id', () => {
    const createModel = createModelFactory(config);
    expect(createModel()).toBe(createModel('cc/default'));
    expect(createModel('cheap/model')).toBe(createModel('cheap/model'));
    expect(createModel('cheap/model')).not.toBe(createModel());
    expect(createModel('cheap/model').model).toBe('cheap/model');
  });
});
