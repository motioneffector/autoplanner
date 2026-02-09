/**
 * Shared schedule invariant assertions for use across all test files
 * that call getSchedule. These checks would have caught both regression
 * bugs (double-wrapped LocalDateTime, stripped time).
 */
import { expect } from 'vitest'

/** Extract the HH:MM:SS portion from a LocalDateTime string */
function timeOf(dt: string): string {
  return dt.slice(11)
}

/** Convert HH:MM:SS to total minutes since midnight */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h! * 60 + m!
}

const DT_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/

/**
 * Asserts structural invariants on every timed instance in a schedule:
 * 1. Valid LocalDateTime format (YYYY-MM-DDTHH:MM:SS)
 * 2. timeOf() produces valid 8-char time with parseable, in-range minutes
 * 3. Duration is positive when present
 */
export function assertScheduleInvariants(schedule: { instances: any[] }): void {
  for (const inst of schedule.instances) {
    if (inst.allDay) continue

    expect(inst.time).toMatch(DT_REGEX)

    const t = timeOf(inst.time as string)
    expect(t.length).toBe(8)
    const mins = timeToMinutes(t)
    expect(Number.isNaN(mins)).toBe(false)
    expect(mins).toBeGreaterThanOrEqual(0)
    expect(mins).toBeLessThan(24 * 60)

    if (inst.duration != null) {
      expect(inst.duration).toBeGreaterThan(0)
    }
  }
}
