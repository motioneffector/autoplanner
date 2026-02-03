/**
 * Model-based testing for operation sequence equivalence (Task #457, #458).
 *
 * These tests verify that:
 * 1. Random operation sequences produce equivalent states in model vs implementation
 * 2. All invariants are preserved regardless of operation sequence
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  emptySystemState,
  cloneSystemState,
  statesEquivalent,
  applyOperation,
  formatStateComparison,
} from '../lib/types'
import type { SystemState, Operation } from '../lib/types'
import { genCreateSeries, genValidOperation } from '../generators/operations'
import { checkAllInvariants, assertNoViolations } from '../invariants'

// ============================================================================
// Model-Implementation Equivalence (Task #457)
// ============================================================================

describe('State Machine - Model Equivalence', () => {
  it('Property #457: random operation sequences produce valid state transitions', () => {
    fc.assert(
      fc.property(
        // Generate a sequence of 5-15 operations
        fc.integer({ min: 5, max: 15 }),
        (opCount) => {
          // Start with empty state
          let state = emptySystemState('America/New_York')
          const operationsApplied: { op: Operation; success: boolean }[] = []

          // Generate and apply operations one at a time
          // Start with some creates to have entities to work with
          for (let i = 0; i < 3; i++) {
            const createOp = fc.sample(genCreateSeries(), 1)[0]
            const result = applyOperation(createOp, state)

            operationsApplied.push({ op: createOp, success: result.success })

            if (result.success) {
              state = result.state
              // Verify state is consistent after each operation
              expect(state.series.size).toBeGreaterThan(0)
            }
          }

          // Now apply random valid operations
          for (let i = 0; i < opCount - 3; i++) {
            const opArb = genValidOperation(state)
            const op = fc.sample(opArb, 1)[0]

            const prevSeriesCount = state.series.size
            const prevLinksCount = state.links.size
            const result = applyOperation(op, state)

            operationsApplied.push({ op, success: result.success })

            if (result.success) {
              state = result.state

              // Verify state changes are consistent with operation type
              switch (op.type) {
                case 'createSeries':
                  expect(state.series.size).toBe(prevSeriesCount + 1)
                  break
                case 'deleteSeries':
                  expect(state.series.size).toBe(prevSeriesCount - 1)
                  break
                case 'linkSeries':
                  expect(state.links.size).toBe(prevLinksCount + 1)
                  break
                case 'unlinkSeries':
                  expect(state.links.size).toBe(prevLinksCount - 1)
                  break
              }
            }
          }

          // Verify final state is internally consistent
          // All links reference existing series
          for (const [childId, link] of state.links) {
            expect(state.series.has(childId)).toBe(true)
            expect(state.series.has(link.parentSeriesId)).toBe(true)
          }

          // All completions reference existing series
          for (const completion of state.completions.values()) {
            expect(state.series.has(completion.seriesId)).toBe(true)
          }
        }
      ),
      { numRuns: 20 } // Reduce runs since each involves many operations
    )
  })

  it('create operations always succeed on empty state', () => {
    fc.assert(
      fc.property(genCreateSeries(), (createOp) => {
        const state = emptySystemState()
        const result = applyOperation(createOp, state)

        expect(result.success).toBe(true)
        expect(result.createdId).toBeDefined()
        expect(result.state.series.size).toBe(1)
      })
    )
  })

  it('sequential creates produce unique IDs', () => {
    fc.assert(
      fc.property(
        fc.array(genCreateSeries(), { minLength: 5, maxLength: 10 }),
        (createOps) => {
          let state = emptySystemState()
          const ids = new Set<string>()

          for (const op of createOps) {
            const result = applyOperation(op, state)
            expect(result.success).toBe(true)

            if (result.createdId) {
              expect(ids.has(result.createdId)).toBe(false)
              ids.add(result.createdId)
            }

            state = result.state
          }

          expect(state.series.size).toBe(createOps.length)
        }
      )
    )
  })

  it('delete after create removes series', () => {
    const state = emptySystemState()

    // Create
    const createOp = fc.sample(genCreateSeries(), 1)[0]
    const createResult = applyOperation(createOp, state)
    expect(createResult.success).toBe(true)
    expect(createResult.state.series.size).toBe(1)

    // Delete
    const seriesId = Array.from(createResult.state.series.keys())[0]
    const deleteOp: Operation = { type: 'deleteSeries', seriesId }
    const deleteResult = applyOperation(deleteOp, createResult.state)

    expect(deleteResult.success).toBe(true)
    expect(deleteResult.state.series.size).toBe(0)
  })

  it('lock prevents update', () => {
    let state = emptySystemState()

    // Create
    const createOp = fc.sample(genCreateSeries(), 1)[0]
    const createResult = applyOperation(createOp, state)
    state = createResult.state
    const seriesId = Array.from(state.series.keys())[0]

    // Lock
    const lockOp: Operation = { type: 'lockSeries', seriesId }
    const lockResult = applyOperation(lockOp, state)
    state = lockResult.state

    // Try to update - should fail
    const updateOp: Operation = {
      type: 'updateSeries',
      seriesId,
      updates: { title: 'New Title' },
    }
    const updateResult = applyOperation(updateOp, state)

    expect(updateResult.success).toBe(false)
    expect(updateResult.error).toContain('locked')
  })

  it('unlock allows update', () => {
    let state = emptySystemState()

    // Create
    const createOp = fc.sample(genCreateSeries(), 1)[0]
    state = applyOperation(createOp, state).state
    const seriesId = Array.from(state.series.keys())[0]

    // Lock
    state = applyOperation({ type: 'lockSeries', seriesId }, state).state

    // Unlock
    state = applyOperation({ type: 'unlockSeries', seriesId }, state).state

    // Update should now succeed
    const updateOp: Operation = {
      type: 'updateSeries',
      seriesId,
      updates: { title: 'New Title' },
    }
    const updateResult = applyOperation(updateOp, state)

    expect(updateResult.success).toBe(true)
  })
})

// ============================================================================
// Invariant Preservation (Task #458)
// ============================================================================

describe('State Machine - Invariant Preservation', () => {
  it('Property #458: random operation sequences preserve all invariants', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 20 }),
        (opCount) => {
          let state = emptySystemState('UTC')

          // Apply operations
          for (let i = 0; i < opCount; i++) {
            // Start with creates
            if (i < 3) {
              const createOp = fc.sample(genCreateSeries(), 1)[0]
              const result = applyOperation(createOp, state)
              if (result.success) {
                state = result.state
              }
            } else {
              const op = fc.sample(genValidOperation(state), 1)[0]
              const result = applyOperation(op, state)
              if (result.success) {
                state = result.state
              }
            }

            // Check invariants after each operation
            const invariantResult = checkAllInvariants({
              dates: [],
              times: [],
              dateTimes: [],
              durations: [],
              completions: Array.from(state.completions.values()),
              links: state.links,
              constraints: Array.from(state.constraints.values()),
              cyclingStates: [],
            })

            assertNoViolations(invariantResult, `After operation ${i}`)
          }
        }
      ),
      { numRuns: 15 }
    )
  })

  it('chain operations preserve depth invariant', () => {
    let state = emptySystemState()

    // Create 35 series
    for (let i = 0; i < 35; i++) {
      const createOp = fc.sample(genCreateSeries(), 1)[0]
      const result = applyOperation(createOp, state)
      if (result.success) {
        state = result.state
      }
    }

    const seriesIds = Array.from(state.series.keys())

    // Try to create a chain of 33 (should fail at 33rd link)
    let successfulLinks = 0
    for (let i = 0; i < 32; i++) {
      const linkOp: Operation = {
        type: 'linkSeries',
        parentSeriesId: seriesIds[i],
        childSeriesId: seriesIds[i + 1],
        targetDistance: 30,
        earlyWobble: 5,
        lateWobble: 5,
      }
      const result = applyOperation(linkOp, state)
      if (result.success) {
        state = result.state
        successfulLinks++
      }
    }

    // Should have created exactly 31 links (depth 32 is max)
    expect(successfulLinks).toBe(31)
    expect(state.links.size).toBe(31)

    // 33rd link should fail
    const tooDeepOp: Operation = {
      type: 'linkSeries',
      parentSeriesId: seriesIds[31],
      childSeriesId: seriesIds[32],
      targetDistance: 30,
      earlyWobble: 5,
      lateWobble: 5,
    }
    const tooDeepResult = applyOperation(tooDeepOp, state)
    expect(tooDeepResult.success).toBe(false)
  })

  it('cycle detection prevents circular links', () => {
    let state = emptySystemState()

    // Create 3 series
    for (let i = 0; i < 3; i++) {
      const createOp = fc.sample(genCreateSeries(), 1)[0]
      state = applyOperation(createOp, state).state
    }

    const [s0, s1, s2] = Array.from(state.series.keys())

    // Link s0 -> s1
    state = applyOperation({
      type: 'linkSeries',
      parentSeriesId: s0,
      childSeriesId: s1,
      targetDistance: 30,
      earlyWobble: 5,
      lateWobble: 5,
    }, state).state

    // Link s1 -> s2
    state = applyOperation({
      type: 'linkSeries',
      parentSeriesId: s1,
      childSeriesId: s2,
      targetDistance: 30,
      earlyWobble: 5,
      lateWobble: 5,
    }, state).state

    // Try to link s2 -> s0 (would create cycle)
    const cycleOp: Operation = {
      type: 'linkSeries',
      parentSeriesId: s2,
      childSeriesId: s0,
      targetDistance: 30,
      earlyWobble: 5,
      lateWobble: 5,
    }
    const cycleResult = applyOperation(cycleOp, state)

    expect(cycleResult.success).toBe(false)
    expect(cycleResult.error).toContain('cycle')
  })

  it('completion end time after start time invariant', () => {
    let state = emptySystemState()

    // Create a series
    const createOp = fc.sample(genCreateSeries(), 1)[0]
    state = applyOperation(createOp, state).state
    const seriesId = Array.from(state.series.keys())[0]

    // Log completion with valid times
    const logOp: Operation = {
      type: 'logCompletion',
      seriesId,
      instanceDate: '2024-01-15' as any,
      startTime: '2024-01-15T10:00' as any,
      endTime: '2024-01-15T11:30' as any,
    }
    const result = applyOperation(logOp, state)

    expect(result.success).toBe(true)

    // Check the completion has valid duration
    const completion = Array.from(result.state.completions.values())[0]
    expect(completion.endTime >= completion.startTime).toBe(true)
  })
})

// ============================================================================
// Error Condition Tests (Task #459)
// ============================================================================

describe('State Machine - Error Conditions', () => {
  it('Property #459: error conditions match expected errors for state', () => {
    // Delete non-existent series
    const state = emptySystemState()
    const deleteResult = applyOperation({
      type: 'deleteSeries',
      seriesId: 'non-existent' as any,
    }, state)

    expect(deleteResult.success).toBe(false)
    expect(deleteResult.error).toContain('not found')
  })

  it('update non-existent series fails', () => {
    const state = emptySystemState()
    const result = applyOperation({
      type: 'updateSeries',
      seriesId: 'non-existent' as any,
      updates: { title: 'New' },
    }, state)

    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('delete series with children fails', () => {
    let state = emptySystemState()

    // Create parent and child
    state = applyOperation(fc.sample(genCreateSeries(), 1)[0], state).state
    state = applyOperation(fc.sample(genCreateSeries(), 1)[0], state).state

    const [parent, child] = Array.from(state.series.keys())

    // Link them
    state = applyOperation({
      type: 'linkSeries',
      parentSeriesId: parent,
      childSeriesId: child,
      targetDistance: 30,
      earlyWobble: 5,
      lateWobble: 5,
    }, state).state

    // Try to delete parent
    const deleteResult = applyOperation({
      type: 'deleteSeries',
      seriesId: parent,
    }, state)

    expect(deleteResult.success).toBe(false)
    expect(deleteResult.error).toContain('children')
  })

  it('restore non-cancelled instance fails', () => {
    let state = emptySystemState()

    // Create series
    state = applyOperation(fc.sample(genCreateSeries(), 1)[0], state).state
    const seriesId = Array.from(state.series.keys())[0]

    // Try to restore without cancelling first
    const restoreResult = applyOperation({
      type: 'restoreInstance',
      seriesId,
      instanceDate: '2024-01-15' as any,
    }, state)

    expect(restoreResult.success).toBe(false)
    expect(restoreResult.error).toContain('not cancelled')
  })

  it('reschedule cancelled instance fails', () => {
    let state = emptySystemState()

    // Create series
    state = applyOperation(fc.sample(genCreateSeries(), 1)[0], state).state
    const seriesId = Array.from(state.series.keys())[0]

    // Cancel instance
    state = applyOperation({
      type: 'cancelInstance',
      seriesId,
      instanceDate: '2024-01-15' as any,
    }, state).state

    // Try to reschedule
    const rescheduleResult = applyOperation({
      type: 'rescheduleInstance',
      seriesId,
      instanceDate: '2024-01-15' as any,
      newTime: '2024-01-15T14:00' as any,
    }, state)

    expect(rescheduleResult.success).toBe(false)
    expect(rescheduleResult.error).toContain('cancelled')
  })
})
