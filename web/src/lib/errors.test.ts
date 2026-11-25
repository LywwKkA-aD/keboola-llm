import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client.ts';
import { translate } from '../i18n/strings.ts';
import { friendlyError, isConflict } from './errors.ts';

const ru = (key: Parameters<typeof translate>[1]) => translate('ru', key);

describe('friendlyError', () => {
  it('words the server conflicts a user can run into', () => {
    expect(friendlyError(new ApiError(409, 'Thread is waiting for an approval'), ru)).toBe(ru('error.waitingApproval'));
    expect(friendlyError(new ApiError(409, 'Thread is busy with another run'), ru)).toBe(ru('error.busyRun'));
    expect(friendlyError(new ApiError(409, 'Approval x is not waiting for an answer'), ru)).toBe(ru('error.approvalGone'));
    expect(friendlyError(new ApiError(409, 'No pending approvals for this thread'), ru)).toBe(ru('error.approvalGone'));
    expect(ru('error.approvalGone')).not.toMatch(/approval/i);
  });

  it('keeps any other message', () => {
    expect(friendlyError(new ApiError(400, 'Invalid request'), ru)).toBe('Invalid request');
    expect(friendlyError('x', ru)).toBe(ru('error.generic'));
    expect(isConflict(new ApiError(409, 'x'))).toBe(true);
    expect(isConflict(new Error('x'))).toBe(false);
  });
});
