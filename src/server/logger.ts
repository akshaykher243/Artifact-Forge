import { pino } from 'pino';
import type { Logger } from 'pino';

/**
 * One logger for the server and the process runner. Warnings and errors only by default;
 * entries never include command arguments, comment text or environments.
 */
export const createLogger = (): Logger => pino({ level: 'warn' });
