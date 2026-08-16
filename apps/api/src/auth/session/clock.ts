export interface Clock {
  now(): Date;
}

/** Production clock: the current time as a Date (UTC epoch, timezone-agnostic). */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
