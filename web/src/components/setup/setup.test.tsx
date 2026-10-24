import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import type { SetupReport } from '../../api/setup-types.ts';
import { DEFAULT_SETTINGS } from '../../api/types.ts';
import { errorResponse, stubApi, stubEventSource } from '../../test-utils/fake-api.ts';
import { baseRoutes } from '../../test-utils/fixtures.ts';
import { SETUP_COMPLETE, setupReport } from '../../test-utils/setup-fixtures.ts';

const KEY = 'sk-omni-super-secret-123';

const pageRoutes = {
  'GET /api/settings': { language: 'en' },
  'GET /api/models': { models: ['a/model', 'b/model'], current: 'a/model' },
  'GET /api/keboola/projects': { projects: [], current: '' },
  'GET /api/memory': { content: '' },
  'GET /api/system': {},
};

/** A server whose setup report the test changes as it goes; records retest requests. */
function setupServer(initial: SetupReport) {
  const state = { report: initial, retests: 0 };
  const route = (_body: unknown, url: URL) => {
    if (url.searchParams.get('retest') === '1') state.retests += 1;
    return state.report;
  };
  return { state, route };
}

/** Settings with the setup checklist open: a complete one starts folded into its summary, so unfold it. */
async function openSetup(report: SetupReport, routes: Record<string, unknown> = {}) {
  const server = setupServer(report);
  const api = stubApi({ ...baseRoutes, ...pageRoutes, 'GET /api/setup': server.route, ...routes });
  window.history.pushState({}, '', '/settings');
  render(<App />);
  const section = await screen.findByRole('region', { name: 'Setup' });
  if (report.complete) await userEvent.click(await within(section).findByRole('button', { name: 'Show the steps' }));
  await within(section).findByRole('list', { name: 'Setup' });
  return { api, server, section };
}

const stepItem = (section: HTMLElement, title: string) => {
  const item = within(section).getByText(title).closest('li');
  if (!item) throw new Error(`No step "${title}"`);
  return item;
};

beforeEach(() => {
  stubEventSource();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('setup checklist', () => {
  it('folds a complete checklist into one summary line that opens the steps', async () => {
    stubApi({ ...baseRoutes, ...pageRoutes, 'GET /api/setup': SETUP_COMPLETE });
    window.history.pushState({}, '', '/settings');
    render(<App />);
    const section = await screen.findByRole('region', { name: 'Setup' });
    expect(await within(section).findByText('All set · 6 of 6')).toBeInTheDocument();
    expect(within(section).queryByRole('list', { name: 'Setup' })).toBeNull();

    const toggle = within(section).getByRole('button', { name: 'Show the steps' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    const list = within(section).getByRole('list', { name: 'Setup' });
    expect(within(section).getByRole('button', { name: 'Hide the steps' })).toHaveAttribute('aria-controls', list.id);
    await userEvent.click(within(section).getByRole('button', { name: 'Hide the steps' }));
    expect(within(section).queryByRole('list', { name: 'Setup' })).toBeNull();
  });

  it('keeps the steps open, without a summary, while one still fails', async () => {
    const { section } = await openSetup(setupReport({ model: { status: 'fail', reason: 'modelFailed', detail: 'a/model: timeout' } }));
    expect(within(section).queryByText(/All set/)).toBeNull();
    expect(within(section).queryByRole('button', { name: 'Show the steps' })).toBeNull();
  });

  it('lists every step with its status, what it is for and the facts from the server', async () => {
    const { server, section } = await openSetup(SETUP_COMPLETE);

    expect(within(section).getAllByRole('listitem')).toHaveLength(6);
    const kbagent = stepItem(section, '4. kbagent is installed');
    expect(within(kbagent).getByText('Done')).toBeInTheDocument();
    expect(within(kbagent).getByText('The Keboola command-line tool the agents work through.')).toBeInTheDocument();
    expect(within(kbagent).getByText('kbagent v0.100.2')).toBeInTheDocument();
    expect(stepItem(section, '1. OmniRoute is running').querySelector('.setup-step__detail')).toHaveTextContent('Models: 2 · http://127.0.0.1:20128/v1');
    // Technical values are set off as code, the words around them are not.
    expect(within(stepItem(section, '6. Project for the team')).getByText('sandbox').tagName).toBe('CODE');

    await userEvent.click(within(section).getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(server.state.retests).toBe(1));
  });

  it('words the facts in the user\'s language', async () => {
    const access = { status: 'ok' as const, detail: 'admin · bigquery · changes: promotion in the app', facts: { kind: 'access' as const, role: 'admin', backend: 'bigquery', changePath: 'promote' as const, protectedProduction: false } };
    const report = setupReport({}, {});
    stubApi({
      ...baseRoutes,
      ...pageRoutes,
      'GET /api/settings': { language: 'ru' },
      'GET /api/setup': { ...report, steps: [...report.steps, { id: 'access', ...access }] },
    });
    window.history.pushState({}, '', '/settings');
    render(<App />);
    const section = await screen.findByRole('region', { name: 'Первый запуск' });
    await userEvent.click(await within(section).findByRole('button', { name: 'Показать шаги' }));
    const detail = (title: string) => within(section).getByText(title).closest('li')?.querySelector('.setup-step__detail');
    expect(detail('3. Модель отвечает')).toHaveTextContent('a/model ответила за 420 мс');
    expect(detail('2. Ключ OmniRoute')).toHaveTextContent('Сохранён, OmniRoute его принимает');
    expect(detail('7. Что команде можно в Keboola')).toHaveTextContent('admin · BigQuery · изменения переносятся в прод из приложения');
    expect(section).not.toHaveTextContent(/answered in|set and accepted|registered/);
  });

  it('offers the commands to install and start what is missing, as PowerShell on Windows', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    const user = userEvent.setup();
    const { section } = await openSetup(
      setupReport({
        omniroute: { status: 'fail', reason: 'unreachable', detail: 'not reachable at http://127.0.0.1:20128/v1 (ECONNREFUSED)' },
        apiKey: { status: 'blocked', detail: 'waiting for OmniRoute' },
        model: { status: 'blocked', detail: 'waiting for OmniRoute and its key' },
        kbagent: { status: 'fail', reason: 'kbagentMissing', detail: 'not installed or not on PATH' },
        projects: { status: 'blocked', detail: 'waiting for kbagent' },
        project: { status: 'blocked', detail: 'waiting for kbagent' },
      }),
    );

    const omniroute = stepItem(section, '1. OmniRoute is running');
    expect(within(omniroute).getByText('To do')).toBeInTheDocument();
    expect(within(omniroute).getByText(/OmniRoute does not answer/)).toBeInTheDocument();
    expect(within(omniroute).getByText('Run in PowerShell')).toBeInTheDocument();
    expect(within(omniroute).getByText(/npm install -g omniroute/)).toBeInTheDocument();
    expect(within(stepItem(section, '3. Model answers')).getByText('Waits for the steps above.')).toBeInTheDocument();

    const kbagent = stepItem(section, '4. kbagent is installed');
    expect(within(kbagent).getByText(/winget install --id astral-sh.uv -e/)).toBeInTheDocument();
    await user.click(within(kbagent).getByRole('button', { name: 'Copy' }));
    expect(await navigator.clipboard.readText()).toContain('uv tool update-shell');
    expect(within(kbagent).getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(within(kbagent).getByRole('button', { name: 'Check again' })).toBeInTheDocument();
  });

  it('uses the shell script and a plain terminal elsewhere', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    const { section } = await openSetup(setupReport({ kbagent: { status: 'fail', reason: 'kbagentMissing', detail: 'x' }, projects: { status: 'blocked', detail: '' }, project: { status: 'blocked', detail: '' } }));
    const kbagent = stepItem(section, '4. kbagent is installed');
    expect(within(kbagent).getByText('Run in a terminal')).toBeInTheDocument();
    expect(within(kbagent).getByText(/install\.sh \| sh/)).toBeInTheDocument();
  });

  it('saves the OmniRoute key from a masked field and never shows it again', async () => {
    const missing = setupReport(
      { apiKey: { status: 'fail', reason: 'keyMissing', detail: 'not set' }, model: { status: 'blocked', detail: '' } },
      { omniroute: { baseUrl: 'http://127.0.0.1:20128/v1', apiKeySet: false } },
    );
    const { api, server, section } = await openSetup(missing, {
      'POST /api/setup/omniroute': () => {
        server.state.report = SETUP_COMPLETE;
        return { baseUrl: 'http://127.0.0.1:20128/v1', apiKeySet: true };
      },
    });
    const step = stepItem(section, '2. OmniRoute key');
    expect(within(step).getByText('No key is saved yet.')).toBeInTheDocument();
    const field = within(step).getByLabelText('OmniRoute API key');
    expect(field).toHaveAttribute('type', 'password');
    expect(field).toHaveAttribute('autocomplete', 'off');

    await userEvent.type(field, `${KEY} x`);
    await userEvent.click(within(step).getByRole('button', { name: 'Save the key' }));
    expect(within(step).getByText('The key has spaces or quotes. Copy it again from OmniRoute.')).toBeInTheDocument();
    expect(api.callsTo('POST', '/api/setup/omniroute')).toHaveLength(0);

    await userEvent.clear(field);
    await userEvent.type(field, KEY);
    await userEvent.click(within(step).getByRole('button', { name: 'Save the key' }));

    expect(api.callsTo('POST', '/api/setup/omniroute')[0]?.body).toEqual({ apiKey: KEY });
    expect(api.calls.every((call) => !call.path.includes(KEY))).toBe(true);
    expect(await within(section).findByText('All set · 6 of 6')).toBeInTheDocument();
    // Fixed right here: the steps stay open to show the result instead of folding away.
    expect(within(section).getByRole('list', { name: 'Setup' })).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(KEY);
  });

  it('can change the OmniRoute address together with the key, and links to its dashboard', async () => {
    const rejected = setupReport({ apiKey: { status: 'fail', reason: 'keyRejected', detail: 'rejected by OmniRoute (HTTP 401)' }, model: { status: 'blocked', detail: '' } });
    const { api, section } = await openSetup(rejected, { 'POST /api/setup/omniroute': { baseUrl: 'http://127.0.0.1:20129/v1', apiKeySet: true } });
    const step = stepItem(section, '2. OmniRoute key');
    expect(within(step).getByText(/did not accept the key/)).toBeInTheDocument();
    expect(within(step).getByRole('link', { name: 'Open the OmniRoute dashboard' })).toHaveAttribute('href', 'http://127.0.0.1:20128/');

    await userEvent.click(within(step).getByRole('button', { name: 'Change the address' }));
    const address = within(step).getByLabelText('OmniRoute address');
    expect(address).toHaveValue('http://127.0.0.1:20128/v1');
    await userEvent.clear(address);
    await userEvent.type(address, 'http://127.0.0.1:20129/v1');
    await userEvent.type(within(step).getByLabelText('OmniRoute API key'), `${KEY}{Enter}`);

    expect(api.callsTo('POST', '/api/setup/omniroute')[0]?.body).toEqual({ apiKey: KEY, baseUrl: 'http://127.0.0.1:20129/v1' });
  });

  it('lets a working key be replaced', async () => {
    const { section } = await openSetup(SETUP_COMPLETE);
    const step = stepItem(section, '2. OmniRoute key');
    expect(within(step).queryByLabelText('OmniRoute API key')).toBeNull();
    await userEvent.click(within(step).getByRole('button', { name: 'Replace the key' }));
    expect(within(step).getByLabelText('OmniRoute API key')).toHaveValue('');
    expect(within(step).getByText('A key is saved. It is never shown again.')).toBeInTheDocument();
  });

  it('picks a model for the team and tests it', async () => {
    let settings = { ...DEFAULT_SETTINGS, language: 'en' as const };
    const { api, server, section } = await openSetup(
      setupReport({ model: { status: 'fail', reason: 'modelFailed', detail: 'a/model: HTTP 404: unknown model' } }),
      {
        'GET /api/settings': () => settings,
        'PUT /api/settings': (body: unknown) => {
          settings = { ...settings, ...(body as object) };
          return settings;
        },
        'POST /api/setup/test-model': () => {
          server.state.report = SETUP_COMPLETE;
          return { ok: true, model: 'b/model', latencyMs: 321 };
        },
      },
    );
    const step = stepItem(section, '3. Model answers');
    expect(within(step).getByText('a/model: HTTP 404: unknown model')).toBeInTheDocument();

    await userEvent.click(within(step).getByRole('combobox', { name: 'Model' }));
    await userEvent.click(await screen.findByRole('option', { name: 'b/model' }));
    expect(api.callsTo('PUT', '/api/settings')[0]?.body).toEqual({ model: 'b/model' });
    await waitFor(() => expect(api.callsTo('GET', '/api/setup').length).toBeGreaterThan(1));

    await userEvent.click(within(step).getByRole('button', { name: 'Test the model' }));
    expect(api.callsTo('POST', '/api/setup/test-model')).toHaveLength(1);
    expect(await within(section).findByText('All set · 6 of 6')).toBeInTheDocument();
  });

  it('shows why a model test failed', async () => {
    const { section } = await openSetup(setupReport({ model: { status: 'fail', reason: 'modelFailed', detail: 'a/model: timeout' } }), {
      'POST /api/setup/test-model': { ok: false, model: 'a/model', latencyMs: 30000, error: 'No answer within 30 s' },
    });
    const step = stepItem(section, '3. Model answers');
    await userEvent.click(within(step).getByRole('button', { name: 'Test the model' }));
    expect(await within(step).findByText('No answer within 30 s')).toBeInTheDocument();
  });

  it('builds the kbagent command to connect a project; the token is typed into kbagent, not here', async () => {
    const { section } = await openSetup(
      setupReport({ projects: { status: 'fail', reason: 'projectsNone', detail: 'none registered' }, project: { status: 'blocked', detail: '' } }, { projects: [] }),
    );
    const step = stepItem(section, '5. Keboola project connected');
    expect(within(step).getByText(/Storage API token/)).toBeInTheDocument();
    expect(within(step).getByText('kbagent project add --project main --url https://connection.keboola.com --token-stdin')).toBeInTheDocument();
    expect(step.querySelector('input[type="password"]')).toBeNull();

    const url = within(step).getByLabelText('Keboola address from your browser');
    await userEvent.clear(url);
    await userEvent.type(url, 'https://connection.eu-central-1.keboola.com/admin/projects/123');
    const alias = within(step).getByLabelText('Short name for the project');
    await userEvent.clear(alias);
    await userEvent.type(alias, 'prod');
    expect(within(step).getByText('kbagent project add --project prod --url https://connection.eu-central-1.keboola.com --token-stdin')).toBeInTheDocument();
    expect(within(step).getByText('kbagent auth login --stack https://connection.eu-central-1.keboola.com --register-projects')).toBeInTheDocument();

    await userEvent.type(alias, ' x');
    expect(within(step).getByText('Use letters, digits, dots, dashes or underscores.')).toBeInTheDocument();
    expect(within(step).queryByText(/kbagent project add/)).toBeNull();
  });

  it('chooses the project for the team among the connected ones', async () => {
    const projects = [
      { alias: 'dev', name: 'Dev', id: 1, stackUrl: 'https://x', isDefault: false },
      { alias: 'prod', name: 'Prod', id: 2, stackUrl: 'https://x', isDefault: false },
    ];
    const { api, section } = await openSetup(setupReport({ project: { status: 'fail', reason: 'projectMissing', detail: 'not chosen' } }, { projects }), {
      'PUT /api/settings': (body: unknown) => ({ ...DEFAULT_SETTINGS, language: 'en', ...(body as object) }),
    });
    const step = stepItem(section, '6. Project for the team');
    await userEvent.click(within(step).getByRole('combobox', { name: 'Project' }));
    await userEvent.click(await screen.findByRole('option', { name: 'prod · Prod (2)' }));
    expect(api.callsTo('PUT', '/api/settings')[0]?.body).toEqual({ keboolaProject: 'prod' });
  });

  it('says so when the setup cannot be checked, and checks again on request', async () => {
    let fail = true;
    const api = stubApi({ ...baseRoutes, ...pageRoutes, 'GET /api/setup': () => (fail ? errorResponse(500, 'Internal error') : SETUP_COMPLETE) });
    window.history.pushState({}, '', '/settings');
    render(<App />);
    const section = await screen.findByRole('region', { name: 'Setup' });
    expect(await within(section).findByText('Could not check the setup: Internal error')).toBeInTheDocument();
    fail = false;
    await userEvent.click(within(section).getByRole('button', { name: 'Check again' }));
    expect(await within(section).findByText('All set · 6 of 6')).toBeInTheDocument();
    expect(api.callsTo('GET', '/api/setup')).toHaveLength(2);
  });
});
