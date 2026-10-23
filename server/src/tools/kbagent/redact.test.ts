import { describe, expect, it } from 'vitest';
import { redactSecrets } from './redact.ts';

describe('redactSecrets', () => {
  it('blanks credential values in JSON output, at any depth', () => {
    const text = JSON.stringify({
      status: 'ok',
      data: { workspace_id: 7, user: 'WS_7', password: 'p@ss"word', credentials: { private_key: 'KEY', privateKey: 'K2' } },
    });
    const redacted = JSON.parse(redactSecrets(text));

    expect(redacted.data).toEqual({
      workspace_id: 7,
      user: 'WS_7',
      password: '[redacted]',
      credentials: { private_key: '[redacted]', privateKey: '[redacted]' },
    });
  });

  it('handles pretty-printed JSON and every sensitive key name, case-insensitively', () => {
    const text = '{\n  "Password": "a",\n  "client_secret": "b",\n  "access_token": "c",\n  "refresh_token": "d",\n  "token": "e",\n  "secret": "f"\n}';
    expect(Object.values(JSON.parse(redactSecrets(text)))).toEqual(Array(6).fill('[redacted]'));
  });

  it('leaves other keys, numbers and non-string values alone', () => {
    const text = '{"token_count": 5, "password_set": true, "description": "password rotation", "token": null}';
    expect(redactSecrets(text)).toBe(text);
  });

  it('redacts inside text that is not valid JSON (e.g. truncated output)', () => {
    expect(redactSecrets('{"rows": [1,2], "password": "x", "user": "u", ...')).toBe('{"rows": [1,2], "password": "[redacted]", "user": "u", ...');
  });
});
