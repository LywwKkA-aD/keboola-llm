/** Load KEY=VALUE pairs from a .env file into process.env; returns false when the file is missing. */
export function loadDotEnv(path) {
  try {
    process.loadEnvFile(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}
