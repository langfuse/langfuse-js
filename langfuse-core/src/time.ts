// Implementation copied form the otel JS SDK: https://github.com/open-telemetry/opentelemetry-js

import { hrtime } from "process";

export type HrTime = [number, number];

const NANOSECOND_DIGITS = 9;
const NANOSECOND_DIGITS_IN_MILLIS = 6;
const MILLISECONDS_TO_NANOSECONDS = Math.pow(10, NANOSECOND_DIGITS_IN_MILLIS);
const SECOND_TO_NANOSECONDS = Math.pow(10, NANOSECOND_DIGITS);

/**
 * This interface defines a fallback to read a timeOrigin when it is not available on performance.timeOrigin,
 * this happens for example on Safari Mac
 * then the timeOrigin is taken from fetchStart - which is the closest to timeOrigin
 */
export interface TimeOriginLegacy {
  timing: {
    fetchStart: number;
  };
}
/**
 *
 * Converts a TimeInput to an HrTime, defaults to _hrtime().
 * @param time
 */
export async function timeInputToHrTime(time: Date | number): Promise<HrTime> {
  if (typeof time === "number") {
    return await hrTime(time);
  }
  return millisToHrTime(time.getTime());
}

/**
 * Returns an hrtime calculated via performance component.
 * @param performanceNow
 */
export function hrTime(performanceNow?: number): HrTime {
  const timeOrigin = millisToHrTime(getTimeOrigin());
  // sleep 100 ms'

  const now = millisToHrTime(typeof performanceNow === "number" ? performanceNow : performance.now());

  console.log("now", now);

  return addHrTimes(timeOrigin, now);
}
/**
 * Converts a number of milliseconds from epoch to HrTime([seconds, remainder in nanoseconds]).
 * @param epochMillis
 */
export function millisToHrTime(epochMillis: number): HrTime {
  const epochSeconds = epochMillis / 1000;
  // Decimals only.
  const seconds = Math.trunc(epochSeconds);
  // Round sub-nanosecond accuracy to nanosecond.
  const nanos = Math.round((epochMillis % 1000) * MILLISECONDS_TO_NANOSECONDS);
  return [seconds, nanos];
}

export function getTimeOrigin(): number {
  let timeOrigin = performance.timeOrigin;
  if (typeof timeOrigin !== "number") {
    const perf: TimeOriginLegacy = performance as unknown as TimeOriginLegacy;
    timeOrigin = perf.timing && perf.timing.fetchStart;
  }
  return timeOrigin;
}

/**
 * Given 2 HrTime formatted times, return their sum as an HrTime.
 */
export function addHrTimes(time1: HrTime, time2: HrTime): HrTime {
  const out = [time1[0] + time2[0], time1[1] + time2[1]] as HrTime;

  // Nanoseconds
  if (out[1] >= SECOND_TO_NANOSECONDS) {
    out[1] -= SECOND_TO_NANOSECONDS;
    out[0] += 1;
  }

  return out;
}

/**
 * Convert hrTime to timestamp, for example "2019-05-14T17:00:00.000123456Z"
 * @param time
 */
export function hrTimeToTimeStamp(time: HrTime): string {
  const precision = NANOSECOND_DIGITS;
  const tmp = `${"0".repeat(precision)}${time[1]}Z`;
  const nanoString = tmp.substr(tmp.length - precision - 1);
  const date = new Date(time[0] * 1000).toISOString();
  return date.replace("000Z", nanoString);
}

export const getCurrentIsoTimestamp = (performanceNow: number): string => {
  // https://dev.to/noamr/when-a-millisecond-is-not-a-millisecond-3h6

  const time = hrTime(performanceNow);

  return hrTimeToTimeStamp(time);
};
