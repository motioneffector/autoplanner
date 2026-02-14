/**
 * Condition Evaluator
 *
 * Manages condition dependency index and evaluates condition trees.
 * Owns conditionDeps Map. No adapter, no hydration — purely derived
 * from series reader state.
 */

import type { LocalDate } from '../time-date'
import { daysBetween } from '../time-date'
import type { ConditionNode } from '../public-api'
import type { SeriesReader } from './types'
import { dayOfWeekNum } from './helpers'

type ConditionEvaluatorDeps = {
  seriesReader: SeriesReader
  countInWindow: (seriesId: string, windowDays: number, asOf: LocalDate) => number
  getLastDate: (seriesId: string) => LocalDate | null
}

export function createConditionEvaluator(deps: ConditionEvaluatorDeps) {
  const { seriesReader, countInWindow, getLastDate } = deps

  const conditionDeps = new Map<string, Set<string>>()

  // ========== Index Building ==========

  function collectConditionRefs(condition: ConditionNode, seriesId: string): void {
    switch (condition.type) {
      case 'completionCount':
        if (condition.seriesRef !== 'self') {
          if (!conditionDeps.has(condition.seriesRef)) {
            conditionDeps.set(condition.seriesRef, new Set())
          }
          conditionDeps.get(condition.seriesRef)!.add(seriesId)
        }
        break
      case 'and':
        for (const c of condition.conditions) collectConditionRefs(c, seriesId)
        break
      case 'or':
        for (const c of condition.conditions) collectConditionRefs(c, seriesId)
        break
      case 'not':
        collectConditionRefs(condition.condition, seriesId)
        break
    }
  }

  function rebuildIndex(): void {
    conditionDeps.clear()
    for (const series of seriesReader.getAll()) {
      for (const pattern of series.patterns || []) {
        if (pattern.condition) {
          collectConditionRefs(pattern.condition, series.id)
        }
      }
    }
  }

  // ========== Evaluation ==========

  function evaluate(condition: ConditionNode, seriesId: string, asOf: LocalDate): boolean {
    if (!condition) return true
    switch (condition.type) {
      case 'completionCount': {
        const targetSeriesId = condition.seriesRef === 'self' ? seriesId : condition.seriesRef
        // For cross-series references, anchor window to target's last completion
        // (but only if the schedule start is within 2x windowDays of that completion)
        // For self-references, use the provided asOf date (schedule start)
        let evaluationDate = asOf
        if (condition.seriesRef !== 'self') {
          const lastComp = getLastDate(targetSeriesId)
          const windowDays = condition.windowDays || 14
          if (lastComp && daysBetween(lastComp, asOf) <= windowDays * 2) {
            evaluationDate = lastComp
          }
        }
        const count = countInWindow(targetSeriesId, condition.windowDays || 14, evaluationDate)
        switch (condition.comparison) {
          case 'lessThan': return count < condition.value
          case 'greaterOrEqual': return count >= condition.value
          case 'greaterThan': return count > condition.value
          case 'lessOrEqual': return count <= condition.value
          case 'equal': return count === condition.value
          default: return true
        }
      }
      case 'and':
        return (condition.conditions || []).every((c: ConditionNode) =>
          evaluate(c, seriesId, asOf)
        )
      case 'or':
        return (condition.conditions || []).some((c: ConditionNode) =>
          evaluate(c, seriesId, asOf)
        )
      case 'not':
        return !evaluate(condition.condition, seriesId, asOf)
      case 'weekday': {
        const dow = dayOfWeekNum(asOf)
        return condition.days.includes(dow)
      }
      default:
        return true
    }
  }

  // ========== Accessors ==========

  function getDeps(): Map<string, Set<string>> {
    const result = new Map<string, Set<string>>()
    for (const [key, value] of conditionDeps) {
      result.set(key, new Set(value))
    }
    return result
  }

  return {
    rebuildIndex,
    evaluate,
    getDeps,
  }
}
