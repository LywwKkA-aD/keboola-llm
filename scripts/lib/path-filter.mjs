/**
 * Build a predicate that decides whether a repo-relative path should be copied.
 * A path is kept when it matches at least one include pattern and no exclude pattern.
 */
export function createPathFilter({ include, exclude = [] }) {
  const includes = include.map((pattern) => new RegExp(pattern));
  const excludes = exclude.map((pattern) => new RegExp(pattern));

  return (relPath) => {
    const normalized = relPath.replaceAll('\\', '/');
    return includes.some((re) => re.test(normalized)) && !excludes.some((re) => re.test(normalized));
  };
}
