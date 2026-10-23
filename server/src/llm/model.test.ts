import { describe, expect, it } from 'vitest';
import { createModelFactory } from './model.ts';

const config = { baseUrl: 'http://127.0.0.1:20128/v1', apiKey: 'test-key', model: 'cc/default' };

describe('createModelFactory', () => {
  it('refuses to start without an API key', () => {
    expect(() => createModelFactory({ ...config, apiKey: '' })).toThrow(/OMNIROUTE_API_KEY/);
  });

  it('refuses to build a model without a model id', () => {
    const createModel = createModelFactory({ ...config, model: '' });
    expect(() => createModel()).toThrow(/OMNIROUTE_MODEL/);
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
