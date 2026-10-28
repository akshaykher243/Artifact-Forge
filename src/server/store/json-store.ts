import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { dirname, join, normalize, sep } from 'node:path';

import type { z } from 'zod';

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

export interface CorruptFile {
  name: string;
  quarantinedAs: string;
}

export interface JsonStore {
  /** Reads a JSON document; a missing one yields `fallback`, a corrupt one is quarantined first. */
  read: <T>(name: string, schema: z.ZodType<T>, fallback: T) => Promise<T>;
  /** Replaces a document atomically: temporary file, fsync, rename. */
  write: (name: string, value: unknown) => Promise<void>;
  /** Reads, changes and writes a document as one step, so concurrent changes are never lost. */
  update: <T>(
    name: string,
    schema: z.ZodType<T>,
    fallback: T,
    change: (value: T) => T,
  ) => Promise<T>;
}

export interface JsonStoreOptions {
  dir: string;
  onCorrupt: (file: CorruptFile) => void;
}

const isMissing = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

/**
 * The app's own data folder. Names are relative paths chosen by the server (never by a
 * request) and must stay inside the folder. Every operation on one name runs in order.
 */
export const createJsonStore = ({ dir, onCorrupt }: JsonStoreOptions): JsonStore => {
  const queues = new Map<string, Promise<unknown>>();

  const pathOf = (name: string): string => {
    const path = normalize(join(dir, name));
    if (!path.startsWith(`${dir}${sep}`)) {
      throw new Error(`Store name escapes the data folder: ${name}`);
    }
    return path;
  };

  const serialise = <T>(name: string, task: () => Promise<T>): Promise<T> => {
    const next = (queues.get(name) ?? Promise.resolve()).then(task, task);
    queues.set(
      name,
      next.catch(() => undefined),
    );
    return next;
  };

  const quarantine = async (name: string, path: string): Promise<void> => {
    const quarantinedAs = `${path}.corrupt-${Date.now()}`;
    await rename(path, quarantinedAs);
    onCorrupt({ name, quarantinedAs });
  };

  const readNow = async <T>(name: string, schema: z.ZodType<T>, fallback: T): Promise<T> => {
    const path = pathOf(name);
    let text: string;
    try {
      text = await readFile(path, 'utf8');
    } catch (error) {
      if (isMissing(error)) {
        return fallback;
      }
      throw error;
    }
    try {
      return schema.parse(JSON.parse(text));
    } catch {
      await quarantine(name, path);
      return fallback;
    }
  };

  const writeNow = async (name: string, value: unknown): Promise<void> => {
    const path = pathOf(name);
    await mkdir(dirname(path), { recursive: true, mode: DIR_MODE });
    const temporary = `${path}.${randomBytes(6).toString('hex')}.tmp`;
    const handle = await open(temporary, 'w', FILE_MODE);
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, path);
  };

  return {
    read: (name, schema, fallback) => serialise(name, () => readNow(name, schema, fallback)),
    write: (name, value) => serialise(name, () => writeNow(name, value)),
    update: (name, schema, fallback, change) =>
      serialise(name, async () => {
        const next = change(await readNow(name, schema, fallback));
        await writeNow(name, next);
        return next;
      }),
  };
};
