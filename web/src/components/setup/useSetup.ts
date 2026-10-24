import { useCallback, useEffect, useRef, useState } from 'react';
import { setupApi } from '../../api/client.ts';
import type { SetupReport } from '../../api/setup-types.ts';

export interface SetupState {
  /** The last checklist; undefined until the first one arrives. */
  readonly report?: SetupReport;
  readonly error?: string;
  readonly checking: boolean;
  /** Run the checks again; `retest` also tests a model whose last test failed. */
  readonly refresh: (retest?: boolean) => void;
}

/** The setup checklist from the server, checked on mount and whenever asked. */
export function useSetup(): SetupState {
  const [report, setReport] = useState<SetupReport>();
  const [error, setError] = useState<string>();
  const [checking, setChecking] = useState(true);
  // Only the newest request may update the state: an older, slower one must not overwrite it.
  const latest = useRef(0);

  const refresh = useCallback((retest = false) => {
    latest.current += 1;
    const request = latest.current;
    const current = () => request === latest.current;
    setChecking(true);
    setupApi
      .report(retest)
      .then(
        (next) => {
          if (!current()) return;
          setReport(next);
          setError(undefined);
        },
        (reason: unknown) => {
          if (current()) setError(reason instanceof Error ? reason.message : String(reason));
        },
      )
      .finally(() => {
        if (current()) setChecking(false);
      });
  }, []);

  useEffect(() => refresh(), [refresh]);

  return { ...(report ? { report } : {}), ...(error === undefined ? {} : { error }), checking, refresh };
}
