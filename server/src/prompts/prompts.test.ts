import { describe, expect, it } from 'vitest';
import { buildOrchestratorPrompt, buildSubagentPrompt } from './compose.ts';
import { isLanguageCode, languageInstruction } from './language.ts';

describe('language', () => {
  it('recognizes supported codes only', () => {
    expect(['ru', 'en', 'cs'].every(isLanguageCode)).toBe(true);
    expect(isLanguageCode('de')).toBe(false);
    expect(isLanguageCode(undefined)).toBe(false);
  });

  it('names the language and keeps technical tokens verbatim', () => {
    const text = languageInstruction('cs');
    expect(text).toContain('Czech');
    expect(text).toMatch(/SQL/);
  });
});

describe('prompt composition', () => {
  it('puts the language rule only into the orchestrator prompt', () => {
    const lead = buildOrchestratorPrompt({ agentPrompt: 'Lead body.', language: 'ru' });
    const helper = buildSubagentPrompt({ agentPrompt: 'Helper body.' });

    expect(lead).toContain('Lead body.');
    expect(lead).toContain('Russian');
    expect(helper).toContain('Helper body.');
    expect(helper).not.toContain('Russian');
    expect(helper).toMatch(/English/);
  });

  it('points every agent at the project profile project-scout keeps', () => {
    expect(buildSubagentPrompt({ agentPrompt: '' })).toContain('/memories/projects/');
    expect(buildOrchestratorPrompt({ agentPrompt: '', language: 'en' })).toContain('/memories/projects/');
  });
});
