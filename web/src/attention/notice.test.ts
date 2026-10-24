import { describe, expect, it } from 'vitest';
import { translate } from '../i18n/strings.ts';
import type { Signal } from '../live/signals.ts';
import { noticeFor } from './notice.ts';

const en = (key: Parameters<typeof translate>[1]) => translate('en', key);
const signal = (kind: Signal['kind'], agent = ''): Signal => ({ id: 1, threadId: 't1', kind, agent });
const chat = { chatTitle: 'Why did the job fail?', routine: false, lead: 'lead' };

describe('noticeFor', () => {
  it('names the chat, the agent and what happened, grouped by chat', () => {
    expect(noticeFor(signal('approval', 'keboola-developer'), chat, en)).toEqual({
      title: 'Why did the job fail?',
      body: 'keboola-developer needs your approval',
      tag: 'chat:t1',
      threadId: 't1',
    });
    expect(noticeFor(signal('finished'), chat, en).body).toBe('lead has finished, the answer is ready');
    expect(noticeFor(signal('failed'), chat, en).body).toBe('lead stopped with an error');
  });

  it('says when a routine run finished', () => {
    const routine = { ...chat, chatTitle: 'Morning check · 2026-10-24', routine: true };
    expect(noticeFor(signal('finished'), routine, en)).toMatchObject({ title: 'Morning check · 2026-10-24', body: 'lead has finished the routine run' });
    expect(noticeFor(signal('failed'), routine, en).body).toBe('lead stopped with an error');
  });

  it('falls back to the lead and the app name when the agent or the chat is unknown', () => {
    expect(noticeFor(signal('approval'), { ...chat, chatTitle: undefined }, en)).toMatchObject({ title: 'Agent Studio', body: 'lead needs your approval' });
  });

  it('speaks the user language', () => {
    const ru = (key: Parameters<typeof translate>[1]) => translate('ru', key);
    expect(noticeFor(signal('approval', 'agent-builder'), chat, ru).body).toBe('agent-builder ждёт вашего подтверждения');
  });
});
