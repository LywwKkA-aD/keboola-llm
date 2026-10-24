import type { ChangePath, SetupFacts } from '../../api/setup-types.ts';
import type { StringKey } from '../../i18n/strings.ts';

/** Words in the user's language, or a technical value shown as code (a URL, an id, a version). */
export type FactPart = { readonly text: string } | { readonly code: string };

type Translate = (key: StringKey) => string;

const text = (value: string): FactPart => ({ text: value });
const code = (value: string): FactPart => ({ code: value });

/** A template like "{model} answered in {ms} ms" with its placeholders replaced by parts. */
function fill(template: string, values: Readonly<Record<string, FactPart>>): FactPart[] {
  return template
    .split(/(\{\w+\})/)
    .filter(Boolean)
    .map((piece) => values[piece.slice(1, -1)] ?? text(piece));
}

const BACKENDS: Readonly<Record<string, string>> = { snowflake: 'Snowflake', bigquery: 'BigQuery' };

const PATHS: Readonly<Record<ChangePath, StringKey>> = {
  promote: 'setup.fact.path.promote',
  'merge-request': 'setup.fact.path.mergeRequest',
  'keboola-ui': 'setup.fact.path.keboolaUi',
  'read-only': 'setup.fact.path.readOnly',
};

const PROJECT_SOURCES: Readonly<Record<'default' | 'only', StringKey>> = { default: 'setup.fact.projectDefault', only: 'setup.fact.projectOnly' };

function accessParts(facts: Extract<SetupFacts, { kind: 'access' }>, t: Translate): FactPart[] {
  const groups: FactPart[][] = [
    ...(facts.role ? [[code(facts.role)]] : facts.token ? [[text(t('setup.fact.token'))]] : []),
    ...(facts.backend ? [[text(BACKENDS[facts.backend] ?? facts.backend)]] : []),
    [text(t(PATHS[facts.changePath]))],
    ...(facts.protectedProduction ? [[text(t('setup.fact.protected'))]] : []),
  ];
  return groups.flatMap((group, index) => (index === 0 ? group : [text(' · '), ...group]));
}

/** What a setup step found, worded for the user: text in their language, technical values as code. Pure. */
export function factParts(facts: SetupFacts, t: Translate): FactPart[] {
  switch (facts.kind) {
    case 'none':
      return [];
    case 'router':
      return facts.models === undefined
        ? fill(t('setup.fact.routerRunning'), { url: code(facts.url) })
        : facts.provider
          ? fill(t('setup.fact.routerProvider'), { count: text(String(facts.models)), provider: code(facts.provider), url: code(facts.url) })
          : fill(t('setup.fact.router'), { count: text(String(facts.models)), url: code(facts.url) });
    case 'unreachable':
      return facts.error
        ? fill(t('setup.fact.unreachableError'), { url: code(facts.url), error: code(facts.error) })
        : fill(t('setup.fact.unreachable'), { url: code(facts.url) });
    case 'http':
      return fill(t('setup.fact.http'), { url: code(facts.url), status: code(String(facts.status)) });
    case 'keyAccepted':
      return [text(t('setup.fact.keyAccepted'))];
    case 'keyRejected':
      return fill(t('setup.fact.keyRejected'), { status: code(String(facts.status)) });
    case 'modelAnswered':
      return fill(t('setup.fact.modelAnswered'), { model: code(facts.model), ms: text(String(facts.ms)) });
    case 'modelFailed':
      return [code(facts.model), text(': '), code(facts.error)];
    case 'version':
      return [code(facts.version)];
    case 'error':
      return [code(facts.message)];
    case 'projects':
      return fill(t('setup.fact.projects'), { count: text(String(facts.aliases.length)), aliases: code(facts.aliases.join(', ')) });
    case 'project':
      return facts.source === 'configured' ? [code(facts.alias)] : fill(t(PROJECT_SOURCES[facts.source]), { alias: code(facts.alias) });
    case 'projectUnknown':
      return fill(t('setup.fact.projectUnknown'), { alias: code(facts.alias) });
    case 'access':
      return accessParts(facts, t);
    case 'session':
      return fill(t('setup.fact.session'), { session: code(facts.session) });
  }
}
