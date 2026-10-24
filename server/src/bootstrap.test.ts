import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootstrap } from './bootstrap.ts';
import { DEFAULT_SETTINGS } from './config/settings.ts';
import { agentMd, makeTree } from './test-utils/tree.ts';

const ENV_KEYS = ['OMNIROUTE_API_KEY', 'OMNIROUTE_MODEL', 'OMNIROUTE_BASE_URL', 'KEBOOLA_PROJECT', 'DATA_DIR', 'PORT', 'HOST'];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  ENV_KEYS.forEach((key) => delete process.env[key]);
});

afterEach(() => {
  ENV_KEYS.forEach((key) => {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  });
});

function repo() {
  return makeTree({
    '.env': 'OMNIROUTE_API_KEY=test-key\nOMNIROUTE_MODEL=cc/test\nKEBOOLA_PROJECT=sandbox\n',
    'agents/lead/AGENT.md': agentMd('name: lead\nrole: orchestrator\ndescription: Leads the team and talks to the user.'),
    'agents/helper/AGENT.md': agentMd('name: helper\ndescription: Answers Keboola questions.\nskills: [house-style, ghost]\ntools: [kbagent]'),
    'agents/broken/AGENT.md': agentMd('name: broken\ndescription: short'),
    'skills/house-style/SKILL.md': '---\nname: house-style\ndescription: SQL style rules of the team.\n---\nUse CTEs.',
  });
}

describe('bootstrap', () => {
  it('loads .env, agents, skills and reports broken definitions', () => {
    const root = repo();
    const app = bootstrap(root);

    expect(app.env.omniroute).toMatchObject({ apiKey: 'test-key', model: 'cc/test' });
    expect(app.env.keboolaProject).toBe('sandbox');
    expect(app.agents.map((agent) => agent.name)).toEqual(['helper', 'lead']);
    expect(app.skills.map((skill) => skill.name)).toEqual(['house-style']);
    expect(app.loadErrors.map((error) => error.file)).toEqual([join(root, 'agents', 'broken', 'AGENT.md')]);
  });

  it('prepares the data folder, shared memory and default settings', () => {
    const root = repo();
    const app = bootstrap(root);

    expect(app.env.dataDir).toBe(join(root, 'data'));
    expect(existsSync(join(root, 'data', 'memories', 'AGENTS.md'))).toBe(true);
    expect(app.settingsFile).toBe(join(root, 'data', 'settings.json'));
    expect(app.loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('builds the team graph without calling the model', () => {
    const app = bootstrap(repo());
    const { spec, graph, effective } = app.buildTeam({ ...DEFAULT_SETTINGS, language: 'en' });

    expect(spec.lead.name).toBe('lead');
    expect(spec.lead.systemPrompt).toContain('English');
    expect(spec.subagents.map((agent) => agent.name)).toEqual(['helper']);
    expect(spec.subagents[0]?.skills).toEqual(['/skills/custom/house-style/']);
    expect(spec.subagents[0]?.tools.map((tool) => tool.name)).toEqual(['kbagent_read']);
    expect(spec.subagents[0]?.tools[0]?.description).toContain('sandbox');
    expect(spec.warnings).toEqual(['helper: unknown skill "ghost"']);
    expect(typeof graph.stream).toBe('function');
    expect(effective).toEqual({ model: 'cc/test', keboolaProject: 'sandbox' });
  });

  it('lets settings override the model and Keboola project from .env', () => {
    const app = bootstrap(repo());
    const { spec, effective } = app.buildTeam({ ...DEFAULT_SETTINGS, model: 'other/model', keboolaProject: 'prod-eu' });

    expect(effective).toEqual({ model: 'other/model', keboolaProject: 'prod-eu' });
    expect(spec.subagents[0]?.tools[0]?.description).toContain('prod-eu');
  });

  it('reloads agents and skills from disk so new definitions join the team without a restart', () => {
    const root = repo();
    const app = bootstrap(root);
    mkdirSync(join(root, 'agents', 'scout'), { recursive: true });
    writeFileSync(join(root, 'agents', 'scout', 'AGENT.md'), agentMd('name: scout\ndescription: Scouts new data sources.\nskills: [ghost]'));
    mkdirSync(join(root, 'skills', 'ghost'), { recursive: true });
    writeFileSync(join(root, 'skills', 'ghost', 'SKILL.md'), '---\nname: ghost\ndescription: Haunts old tables politely.\n---\nBoo.');
    rmSync(join(root, 'agents', 'broken'), { recursive: true });

    app.reloadDefinitions();

    expect(app.agents.map((agent) => agent.name)).toEqual(['helper', 'lead', 'scout']);
    expect(app.skills.map((skill) => skill.name)).toEqual(['ghost', 'house-style']);
    expect(app.loadErrors).toEqual([]);
    const { spec } = app.buildTeam(DEFAULT_SETTINGS);
    expect(spec.subagents.map((agent) => agent.name)).toEqual(['helper', 'scout']);
    expect(spec.warnings).toEqual([]);
  });

  it('fails fast without an OmniRoute key', () => {
    const root = makeTree({ 'agents/lead/AGENT.md': agentMd('name: lead\nrole: orchestrator\ndescription: Leads the team here.') });
    expect(() => bootstrap(root)).toThrow(/OMNIROUTE_API_KEY/);
  });
});
