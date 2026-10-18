/**
 * Editing `.env` in place for the settings page. Comments, blank lines and the
 * order of the keys all survive; a key that is not in the file yet is appended.
 */

/** Only quote when the value would not survive a round trip bare. */
export const quoteEnv = (value: string) =>
  /^$|[\s#"'\\]/.test(value) ? `"${value.replace(/(["\\])/g, "\\$1")}"` : value;

export function patchEnv(text: string, changes: Record<string, string>): string {
  const pending = new Map(Object.entries(changes));

  const lines = text.split(/\r?\n/).map((line) => {
    const match = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    const key = match?.[2];
    if (!key || !pending.has(key)) return line;
    const value = pending.get(key)!;
    pending.delete(key);
    return `${match[1]}${key}=${quoteEnv(value)}`;
  });

  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  for (const [key, value] of pending) lines.push(`${key}=${quoteEnv(value)}`);
  return `${lines.join("\n")}\n`;
}
