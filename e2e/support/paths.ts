import { rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Not 4800/5173: those belong to a dev instance that may be running next to the tests. */
export const APP_PORT = 4900;
export const BASE_URL = `http://127.0.0.1:${APP_PORT}`;

/** Where agent-builder's /skills/custom/e2e-skill/SKILL.md lands on disk (the backend maps it to <root>/skills). */
export const E2E_SKILL_DIR = join(ROOT, 'skills', 'e2e-skill');
export const E2E_SKILL_FILE = join(E2E_SKILL_DIR, 'SKILL.md');

export const removeE2eSkill = (): void => rmSync(E2E_SKILL_DIR, { recursive: true, force: true });
