/**
 * Smoke test for ReminderManager.reader
 *
 * Verifies: (1) reader.get() returns undefined for missing IDs,
 * (2) reader.get() returns a defensive copy, (3) reader.getBySeriesId()
 * returns a copied array.
 */

import { describe, it, expect } from 'vitest'
import { createMockAdapter } from '../src/adapter'
import { createReminderManager } from '../src/internal/reminder-manager'

function makeDeps() {
  return {
    adapter: createMockAdapter(),
    getFullSeries: async () => null,
    completionReader: {
      get: () => undefined,
      getBySeriesId: () => [],
      hasCompletionForKey: () => false,
    },
    exceptionReader: { getByKey: () => undefined },
    onReminderDue: () => {},
  } as Parameters<typeof createReminderManager>[0]
}

describe('ReminderManager.reader', () => {
  it('reader.get() returns correct data for existing and missing IDs', async () => {
    const mgr = createReminderManager(makeDeps())

    // Missing ID returns undefined
    const missing = mgr.reader.get('nonexistent')
    expect(missing).toBe(undefined)

    // Existing ID returns correct data
    const id = await mgr.create('series-1', { type: 'alert', offset: 15 })
    const found = mgr.reader.get(id)
    expect(found!.id).toBe(id)
    expect(found!.seriesId).toBe('series-1')
    expect(found!.type).toBe('alert')
    expect(found!.offset).toBe(15)
  })

  it('reader.get() returns a defensive copy', async () => {
    const mgr = createReminderManager(makeDeps())
    const id = await mgr.create('series-1', { type: 'alert', offset: 15 })

    const a = mgr.reader.get(id)
    const b = mgr.reader.get(id)
    expect(a!.id).toBe(id)
    expect(b!.id).toBe(id)
    expect(a).toEqual(b)
    expect(a).not.toBe(b) // different references

    // Mutating the returned copy must not affect internal state
    a!.type = 'CORRUPTED'
    const c = mgr.reader.get(id)
    expect(c!.type).toBe('alert')
  })

  it('reader.getBySeriesId() returns a copied array', async () => {
    const mgr = createReminderManager(makeDeps())
    const id1 = await mgr.create('series-1', { type: 'a' })
    const id2 = await mgr.create('series-1', { type: 'b' })

    const arr1 = mgr.reader.getBySeriesId('series-1')
    const arr2 = mgr.reader.getBySeriesId('series-1')
    expect(arr1).toEqual([id1, id2])
    expect(arr1).not.toBe(arr2) // different references

    // Mutating the returned array must not affect internal state
    arr1.push('CORRUPTED')
    const arr3 = mgr.reader.getBySeriesId('series-1')
    expect(arr3).toEqual([id1, id2])

  })
})
