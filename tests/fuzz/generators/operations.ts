/**
 * Operation generators for state machine testing.
 *
 * These generators produce valid operations that can be applied to a SystemState.
 * Each generator takes the current state and produces operations that are valid
 * given that state.
 */
import * as fc from 'fast-check'
import {
  minimalSeriesGen,
  localDateGen,
  localDateTimeGen,
  durationGen,
  seriesIdGen,
} from './index'
import type {
  SystemState,
  Operation,
  CreateSeriesOp,
  UpdateSeriesOp,
  DeleteSeriesOp,
  LockSeriesOp,
  UnlockSeriesOp,
  SplitSeriesOp,
  LogCompletionOp,
  DeleteCompletionOp,
  CancelInstanceOp,
  RestoreInstanceOp,
  RescheduleInstanceOp,
  LinkSeriesOp,
  UnlinkSeriesOp,
  AddConstraintOp,
  RemoveConstraintOp,
  AddTagOp,
  RemoveTagOp,
  AcknowledgeReminderOp,
  SeriesId,
  CompletionId,
  ConstraintId,
  LocalDate,
  LocalDateTime,
  Series,
} from '../lib/types'

// ============================================================================
// Create Series Generator (Task #441)
// ============================================================================

/**
 * Generates a valid createSeries operation.
 * This is always valid regardless of current state.
 */
export function genCreateSeries(): fc.Arbitrary<CreateSeriesOp> {
  return minimalSeriesGen().map((series) => ({
    type: 'createSeries' as const,
    series: {
      title: series.title ?? series.name ?? 'Test Series',
      tags: series.tags ?? [],
      patterns: [],
      duration: series.duration ?? series.estimatedDuration ?? (30 as any),
      fixed: series.fixed ?? series.isFixed ?? false,
      reminders: [],
      locked: false,
      bounds: series.bounds ?? { startDate: '2024-01-01' as any },
    },
  }))
}

// ============================================================================
// Update Series Generator (Task #442)
// ============================================================================

/**
 * Generates a valid updateSeries operation.
 * Requires an existing, unlocked series in the state.
 */
export function genUpdateSeries(state: SystemState): fc.Arbitrary<UpdateSeriesOp> | null {
  const unlocked = Array.from(state.series.entries()).filter(([_, s]) => !s.locked)
  if (unlocked.length === 0) return null

  return fc.record({
    type: fc.constant('updateSeries' as const),
    seriesId: fc.constantFrom(...unlocked.map(([id]) => id)),
    updates: fc.record({
      title: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
      fixed: fc.option(fc.boolean(), { nil: undefined }),
    }),
  })
}

// ============================================================================
// Delete Series Generator (Task #443)
// ============================================================================

/**
 * Generates a valid deleteSeries operation.
 * Requires an existing, unlocked series with no child links and no completions.
 */
export function genDeleteSeries(state: SystemState): fc.Arbitrary<DeleteSeriesOp> | null {
  // Find series that are unlocked, have no children, and have no completions
  const deletable = Array.from(state.series.entries()).filter(([id, s]) => {
    if (s.locked) return false
    // Check if any links have this series as parent
    for (const link of state.links.values()) {
      if (link.parentSeriesId === id) return false
    }
    // Check if any completions reference this series
    for (const completion of state.completions.values()) {
      if (completion.seriesId === id) return false
    }
    return true
  })

  if (deletable.length === 0) return null

  return fc.record({
    type: fc.constant('deleteSeries' as const),
    seriesId: fc.constantFrom(...deletable.map(([id]) => id)),
  })
}

// ============================================================================
// Lock Series Generator (Task #444)
// ============================================================================

/**
 * Generates a valid lockSeries operation.
 * Requires an existing series.
 */
export function genLockSeries(state: SystemState): fc.Arbitrary<LockSeriesOp> | null {
  const seriesIds = Array.from(state.series.keys())
  if (seriesIds.length === 0) return null

  return fc.record({
    type: fc.constant('lockSeries' as const),
    seriesId: fc.constantFrom(...seriesIds),
  })
}

// ============================================================================
// Unlock Series Generator (Task #445)
// ============================================================================

/**
 * Generates a valid unlockSeries operation.
 * Requires an existing series.
 */
export function genUnlockSeries(state: SystemState): fc.Arbitrary<UnlockSeriesOp> | null {
  const seriesIds = Array.from(state.series.keys())
  if (seriesIds.length === 0) return null

  return fc.record({
    type: fc.constant('unlockSeries' as const),
    seriesId: fc.constantFrom(...seriesIds),
  })
}

// ============================================================================
// Split Series Generator (Task #446)
// ============================================================================

/**
 * Generates a valid splitSeries operation.
 * Requires an existing, unlocked series.
 */
export function genSplitSeries(state: SystemState): fc.Arbitrary<SplitSeriesOp> | null {
  const unlocked = Array.from(state.series.entries()).filter(([_, s]) => !s.locked)
  if (unlocked.length === 0) return null

  return fc.record({
    type: fc.constant('splitSeries' as const),
    seriesId: fc.constantFrom(...unlocked.map(([id]) => id)),
    splitDate: localDateGen(),
  })
}

// ============================================================================
// Log Completion Generator (Task #447)
// ============================================================================

/**
 * Generates a valid logCompletion operation.
 * Requires an existing series.
 * Ensures endTime >= startTime by generating startTime and adding a duration.
 */
export function genLogCompletion(state: SystemState): fc.Arbitrary<LogCompletionOp> | null {
  const seriesIds = Array.from(state.series.keys())
  if (seriesIds.length === 0) return null

  // Generate startTime and a duration (1-480 minutes), then compute endTime
  return fc.tuple(
    fc.constantFrom(...seriesIds),
    localDateGen(),
    localDateTimeGen(),
    fc.integer({ min: 1, max: 480 }), // duration in minutes
    fc.option(fc.string({ maxLength: 100 }), { nil: undefined })
  ).map(([seriesId, instanceDate, startTime, durationMinutes, notes]) => {
    // Parse startTime and add duration to get endTime
    const startStr = startTime as string
    const startDate = new Date(startStr)
    if (isNaN(startDate.getTime())) throw new Error(`Invalid start date in operation gen: ${startStr}`)
    const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000)
    if (isNaN(endDate.getTime())) throw new Error(`Invalid end date in operation gen`)

    // Format endTime as LocalDateTime
    const endTime = `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth() + 1).padStart(2, '0')}-${String(endDate.getUTCDate()).padStart(2, '0')}T${String(endDate.getUTCHours()).padStart(2, '0')}:${String(endDate.getUTCMinutes()).padStart(2, '0')}:00` as any

    return {
      type: 'logCompletion' as const,
      seriesId,
      instanceDate,
      startTime,
      endTime,
      notes,
    }
  })
}

// ============================================================================
// Delete Completion Generator (Task #448)
// ============================================================================

/**
 * Generates a valid deleteCompletion operation.
 * Requires an existing completion.
 */
export function genDeleteCompletion(state: SystemState): fc.Arbitrary<DeleteCompletionOp> | null {
  const completionIds = Array.from(state.completions.keys())
  if (completionIds.length === 0) return null

  return fc.record({
    type: fc.constant('deleteCompletion' as const),
    completionId: fc.constantFrom(...completionIds),
  })
}

// ============================================================================
// Link Series Generator (Task #449)
// ============================================================================

/**
 * Generates a valid linkSeries operation.
 * Requires two existing series that wouldn't create a cycle.
 */
export function genLinkSeries(state: SystemState): fc.Arbitrary<LinkSeriesOp> | null {
  const seriesIds = Array.from(state.series.keys())
  if (seriesIds.length < 2) return null

  // Filter out pairs that would create cycles or exceed depth
  const validPairs: Array<[SeriesId, SeriesId]> = []

  for (const parent of seriesIds) {
    for (const child of seriesIds) {
      if (parent === child) continue
      if (state.links.has(child)) continue // Already linked

      // Check for cycle
      let current: SeriesId | undefined = parent
      let wouldCycle = false
      let depth = 0
      while (current) {
        if (current === child) {
          wouldCycle = true
          break
        }
        depth++
        if (depth > 31) break
        current = state.links.get(current)?.parentSeriesId
      }

      if (!wouldCycle && depth < 31) {
        validPairs.push([parent, child])
      }
    }
  }

  if (validPairs.length === 0) return null

  return fc.constantFrom(...validPairs).chain(([parent, child]) =>
    fc.record({
      type: fc.constant('linkSeries' as const),
      parentSeriesId: fc.constant(parent),
      childSeriesId: fc.constant(child),
      targetDistance: fc.integer({ min: 5, max: 120 }),
      earlyWobble: fc.integer({ min: 0, max: 30 }),
      lateWobble: fc.integer({ min: 0, max: 30 }),
    })
  )
}

// ============================================================================
// Unlink Series Generator (Task #450)
// ============================================================================

/**
 * Generates a valid unlinkSeries operation.
 * Requires an existing link.
 */
export function genUnlinkSeries(state: SystemState): fc.Arbitrary<UnlinkSeriesOp> | null {
  const linkedChildren = Array.from(state.links.keys())
  if (linkedChildren.length === 0) return null

  return fc.record({
    type: fc.constant('unlinkSeries' as const),
    childSeriesId: fc.constantFrom(...linkedChildren),
  })
}

// ============================================================================
// Add Constraint Generator (Task #451)
// ============================================================================

/**
 * Generates a valid addConstraint operation.
 * Always valid (constraints can reference any target).
 * Note: withinMinutes is only generated for mustBeWithin constraints.
 */
export function genAddConstraint(state: SystemState): fc.Arbitrary<AddConstraintOp> {
  const constraintTypesWithoutWithin = [
    'mustBeOnSameDay',
    'cantBeOnSameDay',
    'mustBeNextTo',
    'cantBeNextTo',
    'mustBeBefore',
    'mustBeAfter',
  ] as const

  const targetGen = fc.record({
    tag: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    seriesId: fc.option(
      state.series.size > 0
        ? fc.constantFrom(...Array.from(state.series.keys()))
        : seriesIdGen(),
      { nil: undefined }
    ),
  })

  // Generate non-mustBeWithin constraints (no withinMinutes)
  const nonWithinConstraintGen = fc.record({
    type: fc.constantFrom(...constraintTypesWithoutWithin),
    sourceTarget: targetGen,
    destTarget: targetGen,
  })

  // Generate mustBeWithin constraints (requires withinMinutes)
  const mustBeWithinConstraintGen = fc.record({
    type: fc.constant('mustBeWithin' as const),
    sourceTarget: targetGen,
    destTarget: targetGen,
    withinMinutes: fc.integer({ min: 1, max: 480 }),
  })

  // 6:1 ratio favoring non-within constraints
  return fc.oneof(
    { weight: 6, arbitrary: nonWithinConstraintGen },
    { weight: 1, arbitrary: mustBeWithinConstraintGen }
  ).map((constraint) => ({
    type: 'addConstraint' as const,
    constraint,
  }))
}

// ============================================================================
// Remove Constraint Generator (Task #452)
// ============================================================================

/**
 * Generates a valid removeConstraint operation.
 * Requires an existing constraint.
 */
export function genRemoveConstraint(state: SystemState): fc.Arbitrary<RemoveConstraintOp> | null {
  const constraintIds = Array.from(state.constraints.keys())
  if (constraintIds.length === 0) return null

  return fc.record({
    type: fc.constant('removeConstraint' as const),
    constraintId: fc.constantFrom(...constraintIds),
  })
}

// ============================================================================
// Cancel Instance Generator (Task #453)
// ============================================================================

/**
 * Generates a valid cancelInstance operation.
 * Requires an existing series.
 */
export function genCancelInstance(state: SystemState): fc.Arbitrary<CancelInstanceOp> | null {
  const seriesIds = Array.from(state.series.keys())
  if (seriesIds.length === 0) return null

  return fc.record({
    type: fc.constant('cancelInstance' as const),
    seriesId: fc.constantFrom(...seriesIds),
    instanceDate: localDateGen(),
  })
}

// ============================================================================
// Restore Instance Generator (Task #454)
// ============================================================================

/**
 * Generates a valid restoreInstance operation.
 * Requires a cancelled instance.
 */
export function genRestoreInstance(state: SystemState): fc.Arbitrary<RestoreInstanceOp> | null {
  const cancelled = Array.from(state.instanceExceptions.entries()).filter(
    ([_, ex]) => ex.type === 'cancelled'
  )
  if (cancelled.length === 0) return null

  return fc.constantFrom(...cancelled).map(([key, ex]) => ({
    type: 'restoreInstance' as const,
    seriesId: ex.seriesId,
    instanceDate: ex.instanceDate,
  }))
}

// ============================================================================
// Reschedule Instance Generator (Task #455 - partial)
// ============================================================================

/**
 * Generates a valid rescheduleInstance operation.
 * Requires an existing series with a non-cancelled instance.
 */
export function genRescheduleInstance(state: SystemState): fc.Arbitrary<RescheduleInstanceOp> | null {
  const seriesIds = Array.from(state.series.keys())
  if (seriesIds.length === 0) return null

  return fc.record({
    type: fc.constant('rescheduleInstance' as const),
    seriesId: fc.constantFrom(...seriesIds),
    instanceDate: localDateGen(),
    newTime: localDateTimeGen(),
  })
}

// ============================================================================
// Add Tag Generator
// ============================================================================

/**
 * Generates a valid addTag operation.
 * Requires an existing series.
 */
export function genAddTag(state: SystemState): fc.Arbitrary<AddTagOp> | null {
  const seriesIds = Array.from(state.series.keys())
  if (seriesIds.length === 0) return null

  return fc.record({
    type: fc.constant('addTag' as const),
    seriesId: fc.constantFrom(...seriesIds),
    tag: fc.string({ minLength: 1, maxLength: 30 }),
  })
}

// ============================================================================
// Remove Tag Generator
// ============================================================================

/**
 * Generates a valid removeTag operation.
 * Requires an existing tag on a series.
 */
export function genRemoveTag(state: SystemState): fc.Arbitrary<RemoveTagOp> | null {
  const tagsToRemove: Array<{ seriesId: SeriesId; tag: string }> = []

  for (const [seriesId, tags] of state.seriesTags) {
    for (const tag of tags) {
      tagsToRemove.push({ seriesId, tag })
    }
  }

  if (tagsToRemove.length === 0) return null

  return fc.constantFrom(...tagsToRemove).map(({ seriesId, tag }) => ({
    type: 'removeTag' as const,
    seriesId,
    tag,
  }))
}

// ============================================================================
// Valid Operation Generator (Task #456)
// ============================================================================

/**
 * Generates a valid operation for the current state.
 * Picks randomly from all available valid operations.
 */
export function genValidOperation(state: SystemState): fc.Arbitrary<Operation> {
  const generators: fc.Arbitrary<Operation>[] = [
    genCreateSeries(), // Always valid
    genAddConstraint(state), // Always valid
  ]

  // Conditionally add state-dependent generators
  const updateGen = genUpdateSeries(state)
  if (updateGen) generators.push(updateGen)

  const deleteGen = genDeleteSeries(state)
  if (deleteGen) generators.push(deleteGen)

  const lockGen = genLockSeries(state)
  if (lockGen) generators.push(lockGen)

  const unlockGen = genUnlockSeries(state)
  if (unlockGen) generators.push(unlockGen)

  const splitGen = genSplitSeries(state)
  if (splitGen) generators.push(splitGen)

  const logCompletionGen = genLogCompletion(state)
  if (logCompletionGen) generators.push(logCompletionGen)

  const deleteCompletionGen = genDeleteCompletion(state)
  if (deleteCompletionGen) generators.push(deleteCompletionGen)

  const linkGen = genLinkSeries(state)
  if (linkGen) generators.push(linkGen)

  const unlinkGen = genUnlinkSeries(state)
  if (unlinkGen) generators.push(unlinkGen)

  const removeConstraintGen = genRemoveConstraint(state)
  if (removeConstraintGen) generators.push(removeConstraintGen)

  const cancelGen = genCancelInstance(state)
  if (cancelGen) generators.push(cancelGen)

  const restoreGen = genRestoreInstance(state)
  if (restoreGen) generators.push(restoreGen)

  const rescheduleGen = genRescheduleInstance(state)
  if (rescheduleGen) generators.push(rescheduleGen)

  const addTagGen = genAddTag(state)
  if (addTagGen) generators.push(addTagGen)

  const removeTagGen = genRemoveTag(state)
  if (removeTagGen) generators.push(removeTagGen)

  return fc.oneof(...generators)
}

// ============================================================================
// Export all generators
// ============================================================================

export const operationGenerators = {
  genCreateSeries,
  genUpdateSeries,
  genDeleteSeries,
  genLockSeries,
  genUnlockSeries,
  genSplitSeries,
  genLogCompletion,
  genDeleteCompletion,
  genLinkSeries,
  genUnlinkSeries,
  genAddConstraint,
  genRemoveConstraint,
  genCancelInstance,
  genRestoreInstance,
  genRescheduleInstance,
  genAddTag,
  genRemoveTag,
  genValidOperation,
}
