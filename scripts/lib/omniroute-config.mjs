const DEFAULT_BASE_URL = 'http://127.0.0.1:20128/v1';

/** Read OmniRoute connection settings from an env-like object. */
export function readOmniRouteConfig(env) {
  const value = (name) => (env[name] ?? '').trim();
  return {
    baseUrl: (value('OMNIROUTE_BASE_URL') || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    apiKey: value('OMNIROUTE_API_KEY'),
    model: value('OMNIROUTE_MODEL'),
  };
}
