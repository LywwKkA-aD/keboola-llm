import { describe, expect, it } from 'vitest';
import { isSupportedNode, parseVersion } from './node-version.mjs';

describe('parseVersion', () => {
  it('parses versions with and without a leading v', () => {
    expect(parseVersion('v24.14.0')).toEqual([24, 14, 0]);
    expect(parseVersion('22.22.2')).toEqual([22, 22, 2]);
  });

  it('returns null for malformed input', () => {
    expect(parseVersion('banana')).toBeNull();
    expect(parseVersion('')).toBeNull();
  });
});

describe('isSupportedNode', () => {
  it.each([
    ['v22.22.2', true],
    ['v22.30.0', true],
    ['v22.22.1', false],
    ['v23.11.0', false],
    ['v24.0.0', true],
    ['v26.9.9', true],
    ['v27.0.0', false],
    ['v20.18.0', false],
    ['nonsense', false],
  ])('%s -> %s', (version, expected) => {
    expect(isSupportedNode(version)).toBe(expected);
  });
});
