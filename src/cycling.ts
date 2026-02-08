/**
 * Cycling Module
 *
 * Rotates through a list of titles across instances of a series.
 * Supports sequential and random modes, with optional gap-leap behavior.
 */

import type { Adapter } from './adapter'
import type { CyclingConfig } from './types'
import type { LocalDate } from './time-date'

// ============================================================================
// Types
// ============================================================================

type CyclingResult<T> = { ok: true; value: T } | { ok: false; error: { type: string; message: string } }

// ============================================================================
// Helpers
// ============================================================================

function ok<T>(value: T): CyclingResult<T> {
  return { ok: true, value }
}

function err<T>(type: string, message: string): CyclingResult<T> {
  return { ok: false, error: { type, message } }
}

/**
 * Deterministic seeded index for random mode.
 * Uses Knuth multiplicative hash with golden ratio constant.
 */
function seededIndex(seed: number, count: number): number {
  // Add salt so seed=0 doesn't degenerate
  let h = ((seed + 0x9e3779b9) | 0) >>> 0
  h = (Math.imul(h ^ (h >>> 16), 0x45d9f3b)) >>> 0
  h = (Math.imul(h ^ (h >>> 16), 0x45d9f3b)) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return h % count
}

// ============================================================================
// Public API
// ============================================================================

export function getCyclingItem(
  config: CyclingConfig,
  opts: { instanceNumber: number }
): string {
  const { items, mode, gapLeap } = config

  if (mode === 'sequential') {
    if (gapLeap) {
      const index = config.currentIndex ?? 0
      return items[index % items.length]!
    } else {
      return items[opts.instanceNumber % items.length]!
    }
  } else {
    // random mode
    const seed = gapLeap ? (config.currentIndex ?? 0) : opts.instanceNumber
    const index = seededIndex(seed, items.length)
    return items[index]!
  }
}

export async function advanceCycling(
  adapter: Adapter,
  seriesId: string
): Promise<CyclingResult<{ currentIndex: number }>> {
  const series = await adapter.getSeries(seriesId)
  if (!series) {
    return err('NotFoundError', `Series '${seriesId}' not found`)
  }

  const cycling = (series as any).cycling
  if (!cycling) {
    return err('NoCyclingError', `Series '${seriesId}' has no cycling config`)
  }

  if (!cycling.gapLeap) {
    return err('GapLeapDisabledError', `Cannot advance cycling: gapLeap is false`)
  }

  const currentIndex = cycling.currentIndex ?? 0
  const newIndex = (currentIndex + 1) % cycling.items.length

  // Update adapter cycling config
  await adapter.updateCyclingIndex(seriesId, newIndex)

  // Update series object's cycling property
  await adapter.updateSeries(seriesId, {
    cycling: { ...cycling, currentIndex: newIndex },
  } as any)

  return ok({ currentIndex: newIndex })
}

export async function resetCycling(
  adapter: Adapter,
  seriesId: string
): Promise<CyclingResult<{ currentIndex: number }>> {
  const series = await adapter.getSeries(seriesId)
  if (!series) {
    return err('NotFoundError', `Series '${seriesId}' not found`)
  }

  const cycling = (series as any).cycling
  if (!cycling) {
    return err('NoCyclingError', `Series '${seriesId}' has no cycling config`)
  }

  // Update adapter cycling config
  await adapter.updateCyclingIndex(seriesId, 0)

  // Update series object's cycling property
  await adapter.updateSeries(seriesId, {
    cycling: { ...cycling, currentIndex: 0 },
  } as any)

  return ok({ currentIndex: 0 })
}

export function resolveInstanceTitle(
  series: any,
  opts: { instanceNumber: number }
): string {
  if (!series.cycling) {
    return series.title
  }
  return getCyclingItem(series.cycling, opts)
}

export function getInstanceNumber(
  instanceDate: LocalDate,
  instanceDates: LocalDate[]
): number {
  const sorted = [...instanceDates].sort()
  return sorted.indexOf(instanceDate)
}
