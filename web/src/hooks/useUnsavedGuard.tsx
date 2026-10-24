import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { useSettings } from '../state/settings-context.tsx';

/** A plain left click on a link to another place in this app, which the router would handle. */
function inAppLink(event: MouseEvent): URL | undefined {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return undefined;
  const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!(anchor instanceof HTMLAnchorElement) || (anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return undefined;
  const url = new URL(anchor.href, window.location.href);
  return url.origin === window.location.origin ? url : undefined;
}

/**
 * Ask before unsaved edits are lost. Closing or reloading the tab gets the browser's own prompt; links in the
 * app (top bar, chat links) and the page's own switches (confirm) get an in-app confirmation. Whatever goes
 * ahead first calls discard, so the editor closes. The router is not a data router, so browser back and
 * forward are not intercepted; the draft stays open then, nothing is lost.
 */
export function useUnsavedGuard(dirty: boolean, discard: () => void): { confirm: (action: () => void) => void; dialog: ReactNode } {
  const { t } = useSettings();
  const navigate = useNavigate();
  const [pending, setPending] = useState<{ run: () => void }>();

  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    // Capture on the document runs before the router's own click handler, which listens further down.
    const onClick = (event: MouseEvent) => {
      const url = inAppLink(event);
      if (!url) return;
      event.preventDefault();
      event.stopPropagation();
      setPending({ run: () => navigate(`${url.pathname}${url.search}${url.hash}`) });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty, navigate]);

  const confirm = useCallback(
    (action: () => void) => {
      if (dirty) {
        setPending({ run: action });
        return;
      }
      discard();
      action();
    },
    [dirty, discard],
  );

  const dialog = pending ? (
    <ConfirmDialog
      title={t('knowledge.discardTitle')}
      message={t('knowledge.discardText')}
      confirmLabel={t('knowledge.discard')}
      cancelLabel={t('knowledge.keepEditing')}
      danger
      onCancel={() => setPending(undefined)}
      onConfirm={() => {
        setPending(undefined);
        discard();
        pending.run();
      }}
    />
  ) : null;

  return { confirm, dialog };
}
