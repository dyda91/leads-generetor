import type { Clock } from './session/clock';

/** Production clock: wall time from the system. Test code injects a fake clock. */
export const systemClock: Clock = {
  now: () => new Date(),
};
