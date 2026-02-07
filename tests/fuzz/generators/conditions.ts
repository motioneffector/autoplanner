/**
 * Condition generators for fuzz testing.
 *
 * Implements generators for all 5 condition types as defined in Spec 7.
 */
import * as fc from 'fast-check'
import type { Arbitrary } from 'fast-check'
import type {
  Condition,
  CountCondition,
  DaysSinceCondition,
  AndCondition,
  OrCondition,
  NotCondition,
  Target,
  ComparisonOperator,
  SeriesId,
} from '../lib/types'
import { seriesIdGen } from './base'

// ============================================================================
// Target Generator
// ============================================================================

/**
 * Generate a target for condition evaluation.
 * A target can reference a series by ID or by tag.
 */
export function targetGen(seriesIdArb: Arbitrary<SeriesId> = seriesIdGen()): Arbitrary<Target> {
  return fc.oneof(
    // Target by tag only
    fc.string({ minLength: 1, maxLength: 20 }).map((tag) => ({ tag: `tag-${tag}` })),
    // Target by series ID only
    seriesIdArb.map((seriesId) => ({ seriesId })),
    // Target by both tag and series ID
    fc.tuple(fc.string({ minLength: 1, maxLength: 20 }), seriesIdArb).map(([tag, seriesId]) => ({ tag: `tag-${tag}`, seriesId }))
  )
}

/**
 * Generate a target with only a tag (for multi-series matching).
 */
export function tagTargetGen(): Arbitrary<Target> {
  return fc.string({ minLength: 1, maxLength: 20 }).map((tag) => ({ tag }))
}

/**
 * Generate a target with only a series ID (for single-series matching).
 */
export function seriesTargetGen(seriesIdArb: Arbitrary<SeriesId> = seriesIdGen()): Arbitrary<Target> {
  return seriesIdArb.map((seriesId) => ({ seriesId }))
}

// ============================================================================
// Comparison Operator Generator
// ============================================================================

/**
 * Generate a comparison operator.
 */
export function comparisonOperatorGen(): Arbitrary<ComparisonOperator> {
  return fc.constantFrom<ComparisonOperator>('<', '<=', '=', '>=', '>')
}

// ============================================================================
// Leaf Condition Generators
// ============================================================================

/**
 * Generate a count condition.
 * Counts completions within a window of days.
 *
 * @param options.maxThreshold - Maximum threshold value (default: 100)
 * @param options.maxWindowDays - Maximum window days (default: 365)
 */
export function countConditionGen(options?: {
  maxThreshold?: number
  maxWindowDays?: number
  targetGen?: Arbitrary<Target>
}): Arbitrary<CountCondition> {
  const maxThreshold = options?.maxThreshold ?? 100
  const maxWindowDays = options?.maxWindowDays ?? 365
  const target = options?.targetGen ?? targetGen()

  return fc
    .tuple(target, comparisonOperatorGen(), fc.integer({ min: 0, max: maxThreshold }), fc.integer({ min: 1, max: maxWindowDays }))
    .map(([target, comparison, threshold, windowDays]) => ({
      type: 'count' as const,
      target,
      comparison,
      threshold,
      windowDays,
    }))
}

/**
 * Generate a daysSince condition.
 * Measures days since last completion.
 *
 * @param options.maxThreshold - Maximum threshold value (default: 365)
 */
export function daysSinceConditionGen(options?: {
  maxThreshold?: number
  targetGen?: Arbitrary<Target>
}): Arbitrary<DaysSinceCondition> {
  const maxThreshold = options?.maxThreshold ?? 365
  const target = options?.targetGen ?? targetGen()

  return fc.tuple(target, comparisonOperatorGen(), fc.integer({ min: 0, max: maxThreshold })).map(([target, comparison, threshold]) => ({
    type: 'daysSince' as const,
    target,
    comparison,
    threshold,
  }))
}

/**
 * Generate a leaf condition (count or daysSince).
 * These are the base cases for the condition tree.
 */
export function leafConditionGen(): Arbitrary<Condition> {
  return fc.oneof(countConditionGen(), daysSinceConditionGen())
}

// ============================================================================
// Composite Condition Generators
// ============================================================================

/**
 * Generate an AND condition.
 * Combines multiple conditions with logical AND.
 *
 * @param childGen - Generator for child conditions (defaults to leafConditionGen to avoid deep nesting)
 * @param options.minChildren - Minimum number of child conditions (default: 0)
 * @param options.maxChildren - Maximum number of child conditions (default: 5)
 */
export function andConditionGen(
  childGen: Arbitrary<Condition> = leafConditionGen(),
  options?: { minChildren?: number; maxChildren?: number }
): Arbitrary<AndCondition> {
  const minChildren = options?.minChildren ?? 1
  const maxChildren = options?.maxChildren ?? 5

  return fc.array(childGen, { minLength: minChildren, maxLength: maxChildren }).map((conditions) => ({
    type: 'and' as const,
    conditions,
  }))
}

/**
 * Generate an OR condition.
 * Combines multiple conditions with logical OR.
 *
 * @param childGen - Generator for child conditions (defaults to leafConditionGen to avoid deep nesting)
 * @param options.minChildren - Minimum number of child conditions (default: 0)
 * @param options.maxChildren - Maximum number of child conditions (default: 5)
 */
export function orConditionGen(
  childGen: Arbitrary<Condition> = leafConditionGen(),
  options?: { minChildren?: number; maxChildren?: number }
): Arbitrary<OrCondition> {
  const minChildren = options?.minChildren ?? 1
  const maxChildren = options?.maxChildren ?? 5

  return fc.array(childGen, { minLength: minChildren, maxLength: maxChildren }).map((conditions) => ({
    type: 'or' as const,
    conditions,
  }))
}

/**
 * Generate a NOT condition.
 * Negates a single condition.
 *
 * @param childGen - Generator for the child condition (defaults to leafConditionGen to avoid deep nesting)
 */
export function notConditionGen(childGen: Arbitrary<Condition> = leafConditionGen()): Arbitrary<NotCondition> {
  return childGen.map((condition) => ({
    type: 'not' as const,
    condition,
  }))
}

// ============================================================================
// Full Condition Tree Generators
// ============================================================================

/**
 * Generate any condition (including composite conditions).
 * Uses controlled recursion depth to avoid infinite generation.
 *
 * @param maxDepth - Maximum nesting depth (default: 3)
 */
export function conditionGen(maxDepth: number = 3): Arbitrary<Condition> {
  if (maxDepth <= 1) {
    return leafConditionGen()
  }

  const childGen = conditionGen(maxDepth - 1)

  return fc.oneof(
    { weight: 4, arbitrary: leafConditionGen() }, // Higher weight for leaf to keep trees manageable
    { weight: 1, arbitrary: andConditionGen(childGen, { minChildren: 1, maxChildren: 3 }) },
    { weight: 1, arbitrary: orConditionGen(childGen, { minChildren: 1, maxChildren: 3 }) },
    { weight: 1, arbitrary: notConditionGen(childGen) }
  )
}

/**
 * Generate a simple condition (no composite conditions).
 * Alias for leafConditionGen for consistency with simplePatternGen.
 */
export function simpleConditionGen(): Arbitrary<Condition> {
  return leafConditionGen()
}

// ============================================================================
// Boundary Condition Generators
// ============================================================================

/**
 * Generate boundary conditions for edge case testing.
 */
export function boundaryConditionGen(): Arbitrary<Condition> {
  return fc.oneof(
    // Count conditions with boundary values
    fc.constant<CountCondition>({
      type: 'count',
      target: { tag: 'test' },
      comparison: '=',
      threshold: 0, // Zero threshold
      windowDays: 1, // Minimum window
    }),
    fc.constant<CountCondition>({
      type: 'count',
      target: { tag: 'test' },
      comparison: '>=',
      threshold: 100, // High threshold
      windowDays: 365, // Full year window
    }),
    fc.constant<CountCondition>({
      type: 'count',
      target: { tag: 'test' },
      comparison: '<',
      threshold: 1, // Just above zero
      windowDays: 7, // Week window
    }),

    // DaysSince conditions with boundary values
    fc.constant<DaysSinceCondition>({
      type: 'daysSince',
      target: { tag: 'test' },
      comparison: '=',
      threshold: 0, // Same day
    }),
    fc.constant<DaysSinceCondition>({
      type: 'daysSince',
      target: { tag: 'test' },
      comparison: '>',
      threshold: 365, // Over a year
    }),
    fc.constant<DaysSinceCondition>({
      type: 'daysSince',
      target: { tag: 'test' },
      comparison: '<=',
      threshold: 1, // Yesterday or today
    }),

    // Empty AND (always true)
    fc.constant<AndCondition>({
      type: 'and',
      conditions: [],
    }),

    // Empty OR (always false)
    fc.constant<OrCondition>({
      type: 'or',
      conditions: [],
    }),

    // NOT of leaf conditions
    notConditionGen(leafConditionGen()),

    // Deeply nested NOT (NOT(NOT(NOT(x))))
    fc.constant<NotCondition>({
      type: 'not',
      condition: {
        type: 'not',
        condition: {
          type: 'not',
          condition: {
            type: 'count',
            target: { tag: 'test' },
            comparison: '=',
            threshold: 1,
            windowDays: 7,
          },
        },
      },
    }),

    // Single-element AND/OR
    andConditionGen(leafConditionGen(), { minChildren: 1, maxChildren: 1 }),
    orConditionGen(leafConditionGen(), { minChildren: 1, maxChildren: 1 }),

    // All comparison operators
    fc.constantFrom<ComparisonOperator>('<', '<=', '=', '>=', '>').map(
      (op): CountCondition => ({
        type: 'count',
        target: { tag: 'boundary' },
        comparison: op,
        threshold: 5,
        windowDays: 30,
      })
    ),

    // Random condition (for coverage)
    conditionGen()
  )
}

/**
 * Generate conditions with realistic structure.
 * More common patterns are weighted higher.
 */
export function realisticConditionGen(): Arbitrary<Condition> {
  return fc.oneof(
    { weight: 30, arbitrary: countConditionGen({ maxThreshold: 10, maxWindowDays: 30 }) }, // Common: "did X times this week/month"
    { weight: 25, arbitrary: daysSinceConditionGen({ maxThreshold: 14 }) }, // Common: "haven't done X in N days"
    {
      weight: 15,
      arbitrary: andConditionGen(leafConditionGen(), { minChildren: 2, maxChildren: 3 }),
    }, // "Do X if A and B"
    {
      weight: 10,
      arbitrary: orConditionGen(leafConditionGen(), { minChildren: 2, maxChildren: 3 }),
    }, // "Do X if A or B"
    { weight: 5, arbitrary: notConditionGen(leafConditionGen()) } // "Do X if not Y"
  )
}

/**
 * Generate a condition tree guaranteed to have a specific depth.
 * Useful for testing depth limits.
 *
 * @param depth - Exact depth of the condition tree (1 = leaf)
 */
export function conditionWithDepthGen(depth: number): Arbitrary<Condition> {
  if (depth <= 1) {
    return leafConditionGen()
  }

  const childGen = conditionWithDepthGen(depth - 1)

  return fc.oneof(
    andConditionGen(childGen, { minChildren: 1, maxChildren: 2 }),
    orConditionGen(childGen, { minChildren: 1, maxChildren: 2 }),
    notConditionGen(childGen)
  )
}
