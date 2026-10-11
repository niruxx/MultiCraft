/**
 * Reads an Outpost setting from the environment: OUTPOST_<NAME>, falling back to the pre-rename
 * MULTICRAFT_<NAME> so existing service files and shells keep working.
 */
export function envVar(name: string): string | undefined {
  const value = process.env[`OUTPOST_${name}`] ?? process.env[`MULTICRAFT_${name}`];
  return value === '' ? undefined : value;
}
