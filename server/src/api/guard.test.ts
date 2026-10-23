import { describe, expect, it } from 'vitest';
import { allowedFor, isAllowedRequest } from './guard.ts';

const allowed = allowedFor({ port: 4800, devPort: 5173 });

describe('isAllowedRequest', () => {
  it('accepts same-origin and dev-server requests on loopback', () => {
    expect(isAllowedRequest({ host: '127.0.0.1:4800' }, allowed)).toBe(true);
    expect(isAllowedRequest({ host: 'localhost:4800', origin: 'http://localhost:4800' }, allowed)).toBe(true);
    expect(isAllowedRequest({ host: 'localhost:5173', origin: 'http://localhost:5173' }, allowed)).toBe(true);
  });

  it('blocks DNS-rebinding hosts and foreign origins', () => {
    expect(isAllowedRequest({ host: 'evil.example:4800' }, allowed)).toBe(false);
    expect(isAllowedRequest({ host: '127.0.0.1:4800', origin: 'https://evil.example' }, allowed)).toBe(false);
    expect(isAllowedRequest({ host: '127.0.0.1:4800', origin: 'null' }, allowed)).toBe(false);
    expect(isAllowedRequest({}, allowed)).toBe(false);
  });
});
