import { describe, expect, it } from 'vitest';
import { createAutoApprover } from './auto-approve.ts';

const sql = (args: unknown) => ({ tool: 'kbagent_sql', args: { args, purpose: 'p' }, decisions: ['approve', 'reject'] });

describe('createAutoApprover', () => {
  const approve = createAutoApprover({ isSqlAllowed: (threadId) => threadId === 'allowed' });

  it('approves workspace SQL calls in chats where SQL is allowed', () => {
    expect(approve('allowed', sql(['workspace', 'query', '--workspace-id', '7', '--sql', 'SELECT 1']))).toBe(true);
    expect(approve('allowed', sql(['workspace', 'create', '--name', 'agent-ws']))).toBe(true);
  });

  it('asks the user in chats where SQL is not allowed', () => {
    expect(approve('other', sql(['workspace', 'query', '--workspace-id', '7', '--sql', 'SELECT 1']))).toBe(false);
    expect(approve('other', sql(['workspace', 'create', '--name', 'agent-ws']))).toBe(false);
  });

  it('never asks about listing or inspecting workspaces: kbagent classifies those as reads', () => {
    expect(approve('other', sql(['workspace', 'list']))).toBe(true);
    expect(approve('other', sql(['workspace', 'detail', '--workspace-id', '7']))).toBe(true);
  });

  it('never approves other tools, other operations or malformed args', () => {
    expect(approve('allowed', { tool: 'kbagent_write', args: { args: ['workspace', 'query'] }, decisions: [] })).toBe(false);
    expect(approve('allowed', { tool: 'write_file', args: { file_path: '/agents/x.md' }, decisions: [] })).toBe(false);
    expect(approve('allowed', sql(['config', 'update', '--config-id', '1']))).toBe(false);
    expect(approve('allowed', sql(['workspace', 'delete', '--workspace-id', '7']))).toBe(false);
    expect(approve('allowed', sql('workspace query'))).toBe(false);
    expect(approve('allowed', { tool: 'kbagent_sql', args: {}, decisions: [] })).toBe(false);
  });
});
