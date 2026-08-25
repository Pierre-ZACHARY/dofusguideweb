import { sleep as defaultSleep, type Sleep } from "./sleep.js";

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs?: number;
  shouldRetry: (error: unknown) => boolean;
  getDelayMs?: (error: unknown, retryNumber: number, exponentialDelayMs: number) => number;
  onRetry?: (error: unknown, retryNumber: number, delayMs: number) => void;
  sleep?: Sleep;
}

export function exponentialBackoff(retryNumber: number, baseDelayMs = 500): number {
  if (!Number.isInteger(retryNumber) || retryNumber < 1) {
    throw new RangeError("retryNumber must be a positive integer");
  }

  return baseDelayMs * 2 ** (retryNumber - 1);
}

export async function retry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const wait = options.sleep ?? defaultSleep;
  const baseDelayMs = options.baseDelayMs ?? 500;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      const retryNumber = attempt + 1;
      if (retryNumber > options.maxRetries || !options.shouldRetry(error)) {
        throw error;
      }

      const exponentialDelayMs = exponentialBackoff(retryNumber, baseDelayMs);
      const delayMs = Math.max(
        0,
        options.getDelayMs?.(error, retryNumber, exponentialDelayMs) ?? exponentialDelayMs,
      );
      options.onRetry?.(error, retryNumber, delayMs);
      await wait(delayMs);
    }
  }
}
