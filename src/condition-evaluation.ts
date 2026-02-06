/**
 * Condition Evaluation
 *
 * Pure functions for evaluating scheduling conditions against completion history.
 * Conditions are boolean expressions that gate pattern activation.
 */

import { type LocalDate, addDays, daysBetween } from './time-date'

export type { LocalDate } from './time-date'

// ============================================================================
// Types
// ============================================================================

export type Target = { type: 'tag'; tag: string } | { type: 'seriesId'; seriesId: string }

export type Completion = {
  seriesId: string
  date: LocalDate
  tags?: string[]
}

export type CompletionStore = {
  completions: Completion[]
  getCompletionsInWindow: (target: Target, windowStart: LocalDate, windowEnd: LocalDate) => Completion[]
  getLastCompletion: (target: Target) => Completion | null
}

type Operator = '>=' | '>' | '<=' | '<' | '==' | '!='

export type Condition =
  | { type: 'count'; target: Target; operator: Operator; value: number; windowDays: number }
  | { type: 'daysSince'; target: Target; operator: Operator; value: number }
  | { type: 'and'; conditions: Condition[] }
  | { type: 'or'; conditions: Condition[] }
  | { type: 'not'; condition: Condition }

// ============================================================================
// Errors
// ============================================================================

export class InvalidConditionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidConditionError'
  }
}

// ============================================================================
// Target Constructors
// ============================================================================

export function byTag(tag: string): Target {
  return { type: 'tag', tag }
}

export function bySeriesId(seriesId: string): Target {
  return { type: 'seriesId', seriesId }
}

// ============================================================================
// Condition Constructors
// ============================================================================

export function countCondition(target: Target, operator: Operator, value: number, windowDays: number): Condition {
  if (value < 0) throw new InvalidConditionError(`count value must be >= 0, got ${value}`)
  if (windowDays < 0) throw new InvalidConditionError(`windowDays must be >= 0, got ${windowDays}`)
  return { type: 'count', target, operator, value, windowDays }
}

export function daysSinceCondition(target: Target, operator: Operator, value: number): Condition {
  return { type: 'daysSince', target, operator, value }
}

export function andCondition(conditions: Condition[]): Condition {
  if (conditions.length === 0) throw new InvalidConditionError('and requires at least one condition')
  return { type: 'and', conditions }
}

export function orCondition(conditions: Condition[]): Condition {
  if (conditions.length === 0) throw new InvalidConditionError('or requires at least one condition')
  return { type: 'or', conditions }
}

export function notCondition(condition: Condition): Condition {
  return { type: 'not', condition }
}

// ============================================================================
// Evaluation
// ============================================================================

function compare(actual: number, operator: Operator, expected: number): boolean {
  switch (operator) {
    case '>=': return actual >= expected
    case '>': return actual > expected
    case '<=': return actual <= expected
    case '<': return actual < expected
    case '==': return actual === expected
    case '!=': return actual !== expected
  }
}

function compareNull(operator: Operator): boolean {
  // null = never completed = infinity days since
  switch (operator) {
    case '>=': return true
    case '>': return true
    case '!=': return true
    case '<=': return false
    case '<': return false
    case '==': return false
  }
}

export function evaluateCondition(condition: Condition, store: CompletionStore, asOf: LocalDate): boolean {
  switch (condition.type) {
    case 'count': {
      const windowStart = addDays(asOf, -(condition.windowDays - 1))
      const matches = store.getCompletionsInWindow(condition.target, windowStart, asOf)
      return compare(matches.length, condition.operator, condition.value)
    }
    case 'daysSince': {
      const last = store.getLastCompletion(condition.target)
      if (last === null) return compareNull(condition.operator)
      const days = daysBetween(last.date, asOf)
      return compare(days, condition.operator, condition.value)
    }
    case 'and':
      return condition.conditions.every((c) => evaluateCondition(c, store, asOf))
    case 'or':
      return condition.conditions.some((c) => evaluateCondition(c, store, asOf))
    case 'not':
      return !evaluateCondition(condition.condition, store, asOf)
  }
}
