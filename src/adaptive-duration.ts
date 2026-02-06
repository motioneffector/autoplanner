/**
 * Adaptive Duration Module
 *
 * Calculates scheduled duration based on historical completion times.
 * Algorithm: get durations -> average -> multiply -> clamp -> round -> ensure >= 1.
 */

import type { Adapter } from './adapter'
import type { LocalDate } from './time-date'
import { getDurationsForAdaptive } from './completions'
import { ValidationError } from './series-crud'

// ============================================================================
// Types
// ============================================================================

export type AdaptiveDurationConfig = {
  mode: { type: 'lastN'; n: number } | { type: 'windowDays'; days: number }
  fallback: number
  multiplier: number
  minimum?: number
  maximum?: number
}

// ============================================================================
// Public API
// ============================================================================

export async function calculateAdaptiveDuration(
  adapter: Adapter,
  seriesId: string,
  config: AdaptiveDurationConfig,
  asOf: LocalDate
): Promise<number> {
  // Validate config
  if (config.fallback < 1) {
    throw new ValidationError('Adaptive fallback must be >= 1')
  }
  if (config.multiplier <= 0) {
    throw new ValidationError('Adaptive multiplier must be > 0')
  }
  if (config.minimum !== undefined && config.maximum !== undefined) {
    if (config.minimum > config.maximum) {
      throw new ValidationError('Adaptive minimum must be <= maximum')
    }
  }

  // Get historical durations
  const durations = await getDurationsForAdaptive(adapter, {
    seriesId,
    mode: config.mode,
    asOf,
  })

  // Fallback if no data
  if (durations.length === 0) {
    return config.fallback
  }

  // Calculate average
  const sum = durations.reduce((a, b) => a + b, 0)
  const avg = sum / durations.length

  // Apply multiplier
  let result = avg * config.multiplier

  // Clamp to bounds
  if (config.minimum !== undefined) {
    result = Math.max(result, config.minimum)
  }
  if (config.maximum !== undefined) {
    result = Math.min(result, config.maximum)
  }

  // Round
  result = Math.round(result)

  // Ensure >= 1
  result = Math.max(result, 1)

  return result
}
