import { describe, expect, it } from 'vitest';
import type { SetupFacts } from '../../api/setup-types.ts';
import { translate } from '../../i18n/strings.ts';
import { factParts, type FactPart } from './facts.ts';

const ru = (key: Parameters<typeof translate>[1]) => translate('ru', key);
const en = (key: Parameters<typeof translate>[1]) => translate('en', key);
/** Text with code values in backticks, to read the parts at a glance. */
const plain = (parts: readonly FactPart[]) => parts.map((part) => ('code' in part ? `\`${part.code}\`` : part.text)).join('');

describe('factParts', () => {
  it.each<[string, SetupFacts, string]>([
    ['router', { kind: 'router', url: 'http://127.0.0.1:20128/v1', models: 491 }, 'Моделей: 491 · `http://127.0.0.1:20128/v1`'],
    ['router behind a key', { kind: 'router', url: 'http://omni/v1' }, 'Работает по адресу `http://omni/v1`'],
    ['unreachable', { kind: 'unreachable', url: 'http://omni/v1', error: 'ECONNREFUSED' }, 'Нет ответа по адресу `http://omni/v1`: `ECONNREFUSED`'],
    ['unreachable without an error', { kind: 'unreachable', url: 'http://omni/v1' }, 'Нет ответа по адресу `http://omni/v1`'],
    ['http', { kind: 'http', url: 'http://omni/v1/models', status: 500 }, '`http://omni/v1/models` ответил HTTP `500`'],
    ['key accepted', { kind: 'keyAccepted' }, 'Сохранён, OmniRoute его принимает'],
    ['key rejected', { kind: 'keyRejected', status: 401 }, 'OmniRoute ответил HTTP `401`'],
    ['model answered', { kind: 'modelAnswered', model: 'cc/claude-opus-5-5', ms: 1192 }, '`cc/claude-opus-5-5` ответила за 1192 мс'],
    ['model failed', { kind: 'modelFailed', model: 'a/model', error: 'HTTP 404: unknown model' }, '`a/model`: `HTTP 404: unknown model`'],
    ['version', { kind: 'version', version: 'kbagent v0.100.2' }, '`kbagent v0.100.2`'],
    ['error', { kind: 'error', message: 'kbagent project list failed (exit 5)' }, '`kbagent project list failed (exit 5)`'],
    ['projects', { kind: 'projects', aliases: ['sandbox', 'prod'] }, 'Подключено: 2 · `sandbox, prod`'],
    ['configured project', { kind: 'project', alias: 'sandbox', source: 'configured' }, '`sandbox`'],
    ['default project', { kind: 'project', alias: 'sandbox', source: 'default' }, '`sandbox` (по умолчанию в kbagent)'],
    ['only project', { kind: 'project', alias: 'solo', source: 'only' }, '`solo` (единственный подключённый)'],
    ['unknown project', { kind: 'projectUnknown', alias: 'gone' }, '`gone` не подключён в kbagent'],
    ['expired session', { kind: 'session', session: 'expired' }, 'Сессия kbagent: `expired`'],
    ['nothing to add', { kind: 'none' }, ''],
  ])('%s', (_name, facts, expected) => {
    expect(plain(factParts(facts, ru))).toBe(expected);
  });

  it('says in words who works in Keboola, on which backend and how changes reach production', () => {
    const admin: SetupFacts = { kind: 'access', role: 'admin', backend: 'bigquery', changePath: 'promote', protectedProduction: false };
    expect(plain(factParts(admin, ru))).toBe('`admin` · BigQuery · изменения переносятся в прод из приложения');
    expect(plain(factParts(admin, en))).toBe('`admin` · BigQuery · changes reach production from this app');

    const token: SetupFacts = { kind: 'access', token: true, backend: 'snowflake', changePath: 'keboola-ui', protectedProduction: true };
    expect(plain(factParts(token, ru))).toBe('токен Storage API · Snowflake · в прод изменения переносите вы в Keboola · прод защищён');

    const readOnly: SetupFacts = { kind: 'access', role: 'readOnly', backend: 'exasol', changePath: 'read-only', protectedProduction: false };
    expect(plain(factParts(readOnly, en))).toBe('`readOnly` · exasol · read-only, no changes');
    expect(plain(factParts({ kind: 'access', changePath: 'merge-request', protectedProduction: false }, ru))).toBe(
      'изменения попадают в прод через merge request в Keboola',
    );
  });

  it('words every fact in each language, never the English terminal line', () => {
    const facts: SetupFacts = { kind: 'modelAnswered', model: 'm', ms: 5 };
    expect(plain(factParts(facts, en))).toBe('`m` answered in 5 ms');
    expect(plain(factParts(facts, (key) => translate('cs', key)))).toBe('`m` odpověděl za 5 ms');
  });
});
