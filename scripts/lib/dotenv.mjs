import { loadDotEnv as load } from '../../server/src/config/dotenv.ts';

/**
 * Load KEY=VALUE pairs from a .env file into process.env, the way the server does (byte order mark, UTF-16 file,
 * OmniRoute settings winning over the user's environment); returns false when the file is missing. `warnings`
 * collects what the user should know.
 */
export function loadDotEnv(path, warnings = []) {
  const result = load(path);
  warnings.push(...result.warnings);
  return result.found;
}
