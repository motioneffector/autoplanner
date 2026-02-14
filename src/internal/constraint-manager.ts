/**
 * Constraint Manager
 *
 * Stateful constraint management. Owns the constraints Map.
 * Handles add, remove, getAll, hydration, and split-copy.
 *
 * triggerReflow is NOT called here — the orchestrator handles that.
 */

import type { Adapter } from '../adapter'
import type { StoredConstraint, ConstraintInput, ConstraintTarget } from '../public-api'
import type { ConstraintReader } from './types'
import { uuid } from './helpers'

type ConstraintManagerDeps = {
  adapter: Adapter
}

export function createConstraintManager(deps: ConstraintManagerDeps) {
  const { adapter } = deps

  const constraints = new Map<string, StoredConstraint>()

  // ========== Helpers ==========

  /** Deep-copy a StoredConstraint including nested target objects */
  function copyConstraint(c: StoredConstraint): StoredConstraint {
    return {
      ...c,
      ...(c.target ? { target: { ...c.target } } : {}),
      ...(c.secondTarget ? { secondTarget: { ...c.secondTarget } } : {}),
    }
  }

  // ========== Reader ==========

  const reader: ConstraintReader = {
    getAll(): StoredConstraint[] {
      return [...constraints.values()].map(copyConstraint)
    },
    entries(): Iterable<[string, StoredConstraint]> {
      return [...constraints.entries()].map(([k, v]) => [k, copyConstraint(v)] as [string, StoredConstraint])
    },
  }

  // ========== Operations ==========

  async function add(constraint: ConstraintInput): Promise<string> {
    const id = uuid()
    const data: StoredConstraint = {
      ...constraint,
      id,
      ...(constraint.target ? { target: { ...constraint.target } } : {}),
      ...(constraint.secondTarget ? { secondTarget: { ...constraint.secondTarget } } : {}),
    }
    constraints.set(id, data)
    await adapter.createRelationalConstraint({
      id,
      type: constraint.type,
      sourceTarget: constraint.target ?? { seriesId: constraint.firstSeries! },
      destinationTarget: constraint.secondTarget ?? { seriesId: constraint.secondSeries! },
      ...(constraint.withinMinutes != null ? { withinMinutes: constraint.withinMinutes } : {}),
    })
    return id
  }

  async function remove(id: string): Promise<void> {
    constraints.delete(id)
    await adapter.deleteRelationalConstraint(id)
  }

  function getAll(): StoredConstraint[] {
    return [...constraints.values()].map(copyConstraint)
  }

  async function copyForSplit(originalId: string, newId: string): Promise<void> {
    for (const [, constraint] of [...constraints]) {
      const targetsOriginal = (
        (constraint.target?.type === 'seriesId' && constraint.target.seriesId === originalId) ||
        (constraint.secondTarget?.type === 'seriesId' && constraint.secondTarget.seriesId === originalId)
      )
      if (targetsOriginal) {
        const newConstraintId = uuid()
        const newTarget = constraint.target?.type === 'seriesId' && constraint.target.seriesId === originalId
          ? { type: 'seriesId' as const, seriesId: newId }
          : constraint.target ? { ...constraint.target } : constraint.target
        const newSecondTarget = constraint.secondTarget?.type === 'seriesId' && constraint.secondTarget.seriesId === originalId
          ? { type: 'seriesId' as const, seriesId: newId }
          : constraint.secondTarget ? { ...constraint.secondTarget } : constraint.secondTarget
        const newConstraint = {
          id: newConstraintId,
          type: constraint.type,
          target: newTarget,
          secondTarget: newSecondTarget,
          ...(constraint.withinMinutes != null ? { withinMinutes: constraint.withinMinutes } : {}),
        }
        constraints.set(newConstraintId, newConstraint as StoredConstraint)
        await adapter.createRelationalConstraint({
          id: newConstraintId,
          type: constraint.type,
          sourceTarget: newTarget ?? { seriesId: newId },
          destinationTarget: newSecondTarget ?? { seriesId: newId },
          ...(constraint.withinMinutes != null ? { withinMinutes: constraint.withinMinutes } : {}),
        })
      }
    }
  }

  // ========== Hydration ==========

  async function hydrate(): Promise<void> {
    const allConstraints = await adapter.getAllRelationalConstraints()
    for (const rc of allConstraints) {
      if (!constraints.has(rc.id)) {
        // Reconstruct ConstraintTarget with type discriminator
        // Adapter stores { tag: string } | { seriesId: string } without type field
        const src = rc.sourceTarget as Record<string, unknown>
        const dst = rc.destinationTarget as Record<string, unknown>
        const target: ConstraintTarget = 'tag' in src
          ? { type: 'tag', tag: src.tag as string }
          : { type: 'seriesId', seriesId: src.seriesId as string }
        const secondTarget: ConstraintTarget = 'tag' in dst
          ? { type: 'tag', tag: dst.tag as string }
          : { type: 'seriesId', seriesId: dst.seriesId as string }
        constraints.set(rc.id, {
          id: rc.id,
          type: rc.type,
          target,
          secondTarget,
          ...(rc.withinMinutes != null ? { withinMinutes: rc.withinMinutes } : {}),
        })
      }
    }
  }

  return {
    reader,
    add,
    remove,
    getAll,
    copyForSplit,
    hydrate,
  }
}
