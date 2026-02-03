/**
 * Relational constraint generators for fuzz testing.
 *
 * Implements generators for the 7 constraint types as defined in Spec 10.
 */
import * as fc from 'fast-check'
import type { Arbitrary } from 'fast-check'
import type { RelationalConstraint, ConstraintType, Target, ConstraintId } from '../lib/types'
import { constraintIdGen } from './base'
import { targetGen, tagTargetGen, seriesTargetGen } from './conditions'

// ============================================================================
// Constraint Type Generator
// ============================================================================

/**
 * Generate a constraint type.
 */
export function constraintTypeGen(): Arbitrary<ConstraintType> {
  return fc.constantFrom<ConstraintType>(
    'mustBeOnSameDay',
    'cantBeOnSameDay',
    'mustBeNextTo',
    'cantBeNextTo',
    'mustBeBefore',
    'mustBeAfter',
    'mustBeWithin'
  )
}

// ============================================================================
// Relational Constraint Generators
// ============================================================================

/**
 * Generate a relational constraint.
 * Automatically includes withinMinutes for mustBeWithin type.
 */
export function relationalConstraintGen(options?: {
  idGen?: Arbitrary<ConstraintId>
  typeGen?: Arbitrary<ConstraintType>
  sourceTargetGen?: Arbitrary<Target>
  destTargetGen?: Arbitrary<Target>
  maxWithinMinutes?: number
}): Arbitrary<RelationalConstraint> {
  const idGen = options?.idGen ?? constraintIdGen()
  const typeGen = options?.typeGen ?? constraintTypeGen()
  const sourceTarget = options?.sourceTargetGen ?? targetGen()
  const destTarget = options?.destTargetGen ?? targetGen()
  const maxWithinMinutes = options?.maxWithinMinutes ?? 480 // 8 hours

  return fc.tuple(idGen, typeGen, sourceTarget, destTarget, fc.integer({ min: 1, max: maxWithinMinutes })).map(([id, type, sourceTarget, destTarget, withinMinutes]) => {
    const constraint: RelationalConstraint = {
      id,
      type,
      sourceTarget,
      destTarget,
    }

    // withinMinutes is required iff type = 'mustBeWithin'
    if (type === 'mustBeWithin') {
      constraint.withinMinutes = withinMinutes
    }

    return constraint
  })
}

/**
 * Generate a valid relational constraint with semantic correctness.
 * Ensures constraints are well-formed according to Spec 10 rules.
 */
export function relationalConstraintValidGen(): Arbitrary<RelationalConstraint> {
  return fc.oneof(
    // Same day constraints (bidirectional relationship)
    fc.tuple(constraintIdGen(), tagTargetGen(), tagTargetGen()).map(([id, source, dest]) => ({
      id,
      type: 'mustBeOnSameDay' as const,
      sourceTarget: source,
      destTarget: dest,
    })),
    fc.tuple(constraintIdGen(), tagTargetGen(), tagTargetGen()).map(([id, source, dest]) => ({
      id,
      type: 'cantBeOnSameDay' as const,
      sourceTarget: source,
      destTarget: dest,
    })),

    // Adjacency constraints
    fc.tuple(constraintIdGen(), tagTargetGen(), tagTargetGen()).map(([id, source, dest]) => ({
      id,
      type: 'mustBeNextTo' as const,
      sourceTarget: source,
      destTarget: dest,
    })),
    fc.tuple(constraintIdGen(), tagTargetGen(), tagTargetGen()).map(([id, source, dest]) => ({
      id,
      type: 'cantBeNextTo' as const,
      sourceTarget: source,
      destTarget: dest,
    })),

    // Order constraints (directional)
    fc.tuple(constraintIdGen(), tagTargetGen(), tagTargetGen()).map(([id, source, dest]) => ({
      id,
      type: 'mustBeBefore' as const,
      sourceTarget: source,
      destTarget: dest,
    })),
    fc.tuple(constraintIdGen(), tagTargetGen(), tagTargetGen()).map(([id, source, dest]) => ({
      id,
      type: 'mustBeAfter' as const,
      sourceTarget: source,
      destTarget: dest,
    })),

    // Within constraint (requires withinMinutes)
    fc.tuple(constraintIdGen(), tagTargetGen(), tagTargetGen(), fc.integer({ min: 5, max: 120 })).map(([id, source, dest, withinMinutes]) => ({
      id,
      type: 'mustBeWithin' as const,
      sourceTarget: source,
      destTarget: dest,
      withinMinutes,
    }))
  )
}

// ============================================================================
// Specific Constraint Type Generators
// ============================================================================

/**
 * Generate a mustBeOnSameDay constraint.
 */
export function mustBeOnSameDayConstraintGen(): Arbitrary<RelationalConstraint> {
  return fc.tuple(constraintIdGen(), targetGen(), targetGen()).map(([id, source, dest]) => ({
    id,
    type: 'mustBeOnSameDay' as const,
    sourceTarget: source,
    destTarget: dest,
  }))
}

/**
 * Generate a cantBeOnSameDay constraint.
 */
export function cantBeOnSameDayConstraintGen(): Arbitrary<RelationalConstraint> {
  return fc.tuple(constraintIdGen(), targetGen(), targetGen()).map(([id, source, dest]) => ({
    id,
    type: 'cantBeOnSameDay' as const,
    sourceTarget: source,
    destTarget: dest,
  }))
}

/**
 * Generate a mustBeNextTo constraint.
 */
export function mustBeNextToConstraintGen(): Arbitrary<RelationalConstraint> {
  return fc.tuple(constraintIdGen(), targetGen(), targetGen()).map(([id, source, dest]) => ({
    id,
    type: 'mustBeNextTo' as const,
    sourceTarget: source,
    destTarget: dest,
  }))
}

/**
 * Generate a cantBeNextTo constraint.
 */
export function cantBeNextToConstraintGen(): Arbitrary<RelationalConstraint> {
  return fc.tuple(constraintIdGen(), targetGen(), targetGen()).map(([id, source, dest]) => ({
    id,
    type: 'cantBeNextTo' as const,
    sourceTarget: source,
    destTarget: dest,
  }))
}

/**
 * Generate a mustBeBefore constraint.
 */
export function mustBeBeforeConstraintGen(): Arbitrary<RelationalConstraint> {
  return fc.tuple(constraintIdGen(), targetGen(), targetGen()).map(([id, source, dest]) => ({
    id,
    type: 'mustBeBefore' as const,
    sourceTarget: source,
    destTarget: dest,
  }))
}

/**
 * Generate a mustBeAfter constraint.
 */
export function mustBeAfterConstraintGen(): Arbitrary<RelationalConstraint> {
  return fc.tuple(constraintIdGen(), targetGen(), targetGen()).map(([id, source, dest]) => ({
    id,
    type: 'mustBeAfter' as const,
    sourceTarget: source,
    destTarget: dest,
  }))
}

/**
 * Generate a mustBeWithin constraint (includes required withinMinutes).
 */
export function mustBeWithinConstraintGen(options?: { maxMinutes?: number }): Arbitrary<RelationalConstraint> {
  const maxMinutes = options?.maxMinutes ?? 120

  return fc.tuple(constraintIdGen(), targetGen(), targetGen(), fc.integer({ min: 1, max: maxMinutes })).map(([id, source, dest, withinMinutes]) => ({
    id,
    type: 'mustBeWithin' as const,
    sourceTarget: source,
    destTarget: dest,
    withinMinutes,
  }))
}

// ============================================================================
// Boundary Constraint Generators
// ============================================================================

/**
 * Generate boundary constraint values for edge case testing.
 */
export function boundaryConstraintGen(): Arbitrary<RelationalConstraint> {
  return fc.oneof(
    // Minimal withinMinutes
    fc.tuple(constraintIdGen(), tagTargetGen(), tagTargetGen()).map(([id, source, dest]) => ({
      id,
      type: 'mustBeWithin' as const,
      sourceTarget: source,
      destTarget: dest,
      withinMinutes: 1,
    })),

    // Large withinMinutes (full day)
    fc.tuple(constraintIdGen(), tagTargetGen(), tagTargetGen()).map(([id, source, dest]) => ({
      id,
      type: 'mustBeWithin' as const,
      sourceTarget: source,
      destTarget: dest,
      withinMinutes: 1440, // 24 hours
    })),

    // Self-referential target (same tag for both)
    fc.tuple(constraintIdGen(), fc.string({ minLength: 1, maxLength: 10 })).map(([id, tag]) => ({
      id,
      type: 'mustBeOnSameDay' as const,
      sourceTarget: { tag },
      destTarget: { tag },
    })),

    // Empty tag targets (edge case)
    fc.tuple(constraintIdGen()).map(([id]) => ({
      id,
      type: 'cantBeOnSameDay' as const,
      sourceTarget: { tag: '' },
      destTarget: { tag: '' },
    })),

    // All constraint types
    constraintTypeGen().chain((type) =>
      fc.tuple(constraintIdGen(), tagTargetGen(), tagTargetGen(), fc.integer({ min: 5, max: 60 })).map(([id, source, dest, within]) => ({
        id,
        type,
        sourceTarget: source,
        destTarget: dest,
        ...(type === 'mustBeWithin' ? { withinMinutes: within } : {}),
      }))
    ),

    // Random constraint
    relationalConstraintGen()
  )
}

/**
 * Generate a set of constraints that form a solvable constraint network.
 * Avoids contradictions like (A before B) AND (B before A).
 */
export function solvableConstraintSetGen(options?: { maxConstraints?: number }): Arbitrary<RelationalConstraint[]> {
  const maxConstraints = options?.maxConstraints ?? 5

  // For simplicity, generate non-conflicting same-day and adjacency constraints
  return fc.array(
    fc.oneof(mustBeOnSameDayConstraintGen(), cantBeOnSameDayConstraintGen(), mustBeNextToConstraintGen(), cantBeNextToConstraintGen()),
    { minLength: 0, maxLength: maxConstraints }
  )
}

/**
 * Generate a contradictory constraint pair for negative testing.
 */
export function contradictoryConstraintPairGen(): Arbitrary<[RelationalConstraint, RelationalConstraint]> {
  return fc.tuple(constraintIdGen(), constraintIdGen(), tagTargetGen(), tagTargetGen()).map(([id1, id2, source, dest]) => [
    {
      id: id1,
      type: 'mustBeBefore' as const,
      sourceTarget: source,
      destTarget: dest,
    },
    {
      id: id2,
      type: 'mustBeBefore' as const,
      sourceTarget: dest, // Swapped!
      destTarget: source,
    },
  ])
}
