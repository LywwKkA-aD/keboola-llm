/**
 * Blank credential values in kbagent output before a model sees them. `workspace create` and
 * `workspace from-transformation` return warehouse passwords; agents query through the Query
 * Service with the Storage token and never need them. Works on raw text, so truncated (non-JSON)
 * output is covered too.
 */

const SENSITIVE_KEY = 'password|passwd|private_?key|client_?secret|secret|access_?token|refresh_?token|token';

const SENSITIVE_STRING_VALUE = new RegExp(`("(?:${SENSITIVE_KEY})"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`, 'gi');

export function redactSecrets(text: string): string {
  return text.replace(SENSITIVE_STRING_VALUE, '$1"[redacted]"');
}
