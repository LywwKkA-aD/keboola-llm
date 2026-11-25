/**
 * Blank credential values in kbagent output before a model sees them. `workspace create` and
 * `workspace from-transformation` return warehouse passwords; agents query through the Query
 * Service with the Storage token and never need them. Works on raw text, so truncated (non-JSON)
 * output is covered too.
 */

const SENSITIVE_KEY = 'password|passwd|private_?key|client_?secret|secret|access_?token|refresh_?token|token';

const SENSITIVE_STRING_VALUE = new RegExp(`("(?:${SENSITIVE_KEY})"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`, 'gi');

/** A token in a URL query (`?token=...`, `&access_token=...`), e.g. the OAuth link kbagent mints. */
const TOKEN_PARAMETER = /([?&](?:token|access_token|sapi_token)=)[^&#"\s]+/gi;
/** A Keboola Storage API token wherever it appears: <project id>-<token id>-<40 letters and digits>. */
const STORAGE_TOKEN = /\b\d+-\d+-[A-Za-z0-9]{40}\b/g;

export function redactSecrets(text: string): string {
  return text
    .replace(SENSITIVE_STRING_VALUE, '$1"[redacted]"')
    .replace(TOKEN_PARAMETER, '$1[redacted]')
    .replace(STORAGE_TOKEN, '[redacted]');
}
