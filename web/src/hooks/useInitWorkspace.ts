import { useCallback } from 'react';
import { api } from '../api/client.ts';
import { useSettings } from '../state/settings-context.tsx';

/**
 * /init: the same init workspace the Home card starts (map and production documentation of the project in use).
 * Opens its chat; while one already runs, the server hands back that chat instead of starting another.
 */
export function useInitWorkspace(open: (threadId: string) => void): () => Promise<void> {
  const { t } = useSettings();
  return useCallback(async () => {
    const { project } = await api.onboarding();
    if (!project) throw new Error(t('command.noProject'));
    const { threadId } = await api.startOnboarding(t('onboarding.prompt').replace('{project}', project));
    open(threadId);
  }, [open, t]);
}
