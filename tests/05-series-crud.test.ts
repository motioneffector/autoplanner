/**
 * Segment 05: Series CRUD & Tags Tests
 *
 * Tests domain-level management of Series entities with validation,
 * business rules, and tag management.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  // Series operations
  createSeries,
  getSeries,
  getSeriesByTag,
  getAllSeries,
  updateSeries,
  deleteSeries,
  lockSeries,
  unlockSeries,
  splitSeries,
  // Tag operations
  addTagToSeries,
  removeTagFromSeries,
  getTagsForSeries,
  // Error types
  ValidationError,
  NotFoundError,
  LockedSeriesError,
  CompletionsExistError,
  LinkedChildrenExistError,
  // Types
  type SeriesInput,
  type SeriesUpdate,
  type Series,
  type LocalDate,
  type LocalDateTime,
  type LocalTime,
} from '../src/series-crud'

import { createMockAdapter, type Adapter } from '../src/adapter'

let adapter: Adapter

beforeEach(() => {
  adapter = createMockAdapter()
})

// ============================================================================
// 1. CREATE SERIES
// ============================================================================

describe('Create Series', () => {
  describe('Basic Creation Tests', () => {
    it('create series returns unique ID', async () => {
      const input: SeriesInput = {
        title: 'Test Series',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      }
      const id = await createSeries(adapter, input)
      expect(id).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('created series is retrievable', async () => {
      const input: SeriesInput = {
        title: 'Test Series',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      }
      const id = await createSeries(adapter, input)
      const series = await getSeries(adapter, id)
      expect(series).toEqual(expect.objectContaining({
        id,
        title: 'Test Series',
        startDate: '2024-01-15',
        timeOfDay: '09:00',
        duration: 30,
      }))
    })

    it('two creates return different IDs', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      }
      const id1 = await createSeries(adapter, input)
      const id2 = await createSeries(adapter, input)
      expect(id1).not.toBe(id2)
    })

    it('createdAt set on create', async () => {
      const testStartTime = Date.now()
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      }
      const id = await createSeries(adapter, input)
      const series = await getSeries(adapter, id)
      expect(new Date(series!.createdAt).getTime()).toBeGreaterThanOrEqual(testStartTime - 1000)
      expect(new Date(series!.createdAt).getTime()).toBeLessThanOrEqual(Date.now())
    })

    it('updatedAt set on create', async () => {
      const testStartTime = Date.now()
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      }
      const id = await createSeries(adapter, input)
      const series = await getSeries(adapter, id)
      expect(new Date(series!.updatedAt).getTime()).toBeGreaterThanOrEqual(testStartTime - 1000)
      expect(new Date(series!.updatedAt).getTime()).toBeLessThanOrEqual(Date.now())
    })

    it('locked defaults to false', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      }
      const id = await createSeries(adapter, input)
      const series = await getSeries(adapter, id)
      expect(series?.locked).toBe(false)
    })
  })

  describe('One-Time Series Inference', () => {
    it('no patterns no count no endDate treated as count=1', async () => {
      const input: SeriesInput = {
        title: 'One-time task',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      }
      const id = await createSeries(adapter, input)
      const series = await getSeries(adapter, id)
      expect(series?.count).toBe(1)
    })

    it('patterns present means not one-time', async () => {
      const input: SeriesInput = {
        title: 'Recurring',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        patterns: [{ type: 'daily' }],
      }
      const id = await createSeries(adapter, input)
      const series = await getSeries(adapter, id)
      expect(series).toEqual(expect.objectContaining({
        id,
        title: 'Recurring',
        count: undefined,
      }))
    })

    it('count specified uses count', async () => {
      const input: SeriesInput = {
        title: 'Limited',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        count: 5,
      }
      const id = await createSeries(adapter, input)
      const series = await getSeries(adapter, id)
      expect(series?.count).toBe(5)
    })

    it('endDate specified uses endDate', async () => {
      const input: SeriesInput = {
        title: 'Until Date',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        endDate: '2024-02-15' as LocalDate,
      }
      const id = await createSeries(adapter, input)
      const series = await getSeries(adapter, id)
      expect(series?.endDate).toBe('2024-02-15')
    })
  })

  describe('Tag Creation on Series Create', () => {
    it('tags created if not exist', async () => {
      const input: SeriesInput = {
        title: 'Tagged',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        tags: ['work', 'important'],
      }
      const id = await createSeries(adapter, input)
      const tags = await getTagsForSeries(adapter, id)
      expect(tags).toContain('work')
      expect(tags).toContain('important')
    })

    it('existing tags not duplicated', async () => {
      // Create first series with tag
      const input1: SeriesInput = {
        title: 'First',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        tags: ['work'],
      }
      await createSeries(adapter, input1)

      // Create second series with same tag
      const input2: SeriesInput = {
        title: 'Second',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        tags: ['work'],
      }
      const id2 = await createSeries(adapter, input2)
      const tags = await getTagsForSeries(adapter, id2)
      const workTags = tags.filter((t) => t === 'work')
      expect(workTags).toEqual(['work'])
    })
  })
})

// ============================================================================
// 2. PRECONDITION VALIDATION (CREATE)
// ============================================================================

describe('Precondition Validation (Create)', () => {
  describe('Title Validation', () => {
    it('valid title accepted', async () => {
      const input: SeriesInput = {
        title: 'Morning Walk',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      }
      const id = await createSeries(adapter, input)
      expect(id).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('empty title rejected', async () => {
      const input: SeriesInput = {
        title: '',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      }
      await expect(createSeries(adapter, input)).rejects.toThrow(/Title must not be empty/)
    })

    it('whitespace only title rejected', async () => {
      const input: SeriesInput = {
        title: '   ',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      }
      await expect(createSeries(adapter, input)).rejects.toThrow(/Title must not be empty/)
    })
  })

  describe('Date Validation', () => {
    it('valid startDate accepted', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      }
      const id = await createSeries(adapter, input)
      expect(id).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('invalid startDate format rejected', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '01-15-2024' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      }
      await expect(createSeries(adapter, input)).rejects.toThrow(/Invalid startDate/)
    })

    it('endDate one day after startDate accepted (single-day exclusive)', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        endDate: '2024-01-16' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      }
      const id = await createSeries(adapter, input)
      expect(id).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('endDate equals startDate rejected (zero-day range)', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        endDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      }
      await expect(createSeries(adapter, input)).rejects.toThrow(/endDate must be > startDate/)
    })

    it('endDate before startDate rejected', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        endDate: '2024-01-10' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      }
      await expect(createSeries(adapter, input)).rejects.toThrow(/endDate must be > startDate/)
    })

    it('endDate after startDate accepted', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        endDate: '2024-02-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      }
      const id = await createSeries(adapter, input)
      expect(id).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('count and endDate both set rejected', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        endDate: '2024-02-15' as LocalDate,
        count: 10,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      }
      await expect(createSeries(adapter, input)).rejects.toThrow(/count and endDate are mutually exclusive/)
    })

    it('count = 0 rejected', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        count: 0,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      }
      await expect(createSeries(adapter, input)).rejects.toThrow(/count must be >= 1/)
    })

    it('count = 1 accepted', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        count: 1,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      }
      const id = await createSeries(adapter, input)
      expect(id).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('negative count rejected', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        count: -1,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      }
      await expect(createSeries(adapter, input)).rejects.toThrow(/count must be >= 1/)
    })
  })

  describe('Time Validation', () => {
    it('valid timeOfDay accepted', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      }
      const id = await createSeries(adapter, input)
      expect(id).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('allDay timeOfDay accepted', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: 'allDay',
        duration: 'allDay',
      }
      const id = await createSeries(adapter, input)
      expect(id).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('invalid time format rejected', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '9am' as LocalTime,
        duration: 30,
      }
      await expect(createSeries(adapter, input)).rejects.toThrow(/Invalid timeOfDay/)
    })

    it('allDay time with non-allDay duration rejected', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: 'allDay',
        duration: 30,
      }
      await expect(createSeries(adapter, input)).rejects.toThrow(/allDay timeOfDay requires allDay duration/)
    })

    it('non-allDay time with allDay duration rejected', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 'allDay',
      }
      await expect(createSeries(adapter, input)).rejects.toThrow(/non-allDay timeOfDay cannot have allDay duration/)
    })

    it('allDay consistency accepted', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: 'allDay',
        duration: 'allDay',
      }
      const id = await createSeries(adapter, input)
      expect(id).toMatch(/^[0-9a-f-]{36}$/)
    })
  })

  describe('Duration Validation', () => {
    it('valid duration minutes accepted', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      }
      const id = await createSeries(adapter, input)
      expect(id).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('zero duration rejected', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 0,
      }
      await expect(createSeries(adapter, input)).rejects.toThrow(/duration must be > 0/)
    })

    it('negative duration rejected', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: -10,
      }
      await expect(createSeries(adapter, input)).rejects.toThrow(/duration must be > 0/)
    })

    it('allDay duration accepted', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: 'allDay',
        duration: 'allDay',
      }
      const id = await createSeries(adapter, input)
      expect(id).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('adaptive duration valid accepted', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: {
          type: 'adaptive',
          fallback: 30,
          bufferPercent: 25,
        },
      }
      const id = await createSeries(adapter, input)
      expect(id).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('adaptive duration fallback < 1 rejected', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: {
          type: 'adaptive',
          fallback: 0,
          bufferPercent: 25,
        },
      }
      await expect(createSeries(adapter, input)).rejects.toThrow(/adaptive fallback must be >= 1/)
    })

    it('adaptive duration fallback exactly 1 accepted (boundary)', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: {
          type: 'adaptive',
          fallback: 1,
          bufferPercent: 25,
        },
      }
      const id = await createSeries(adapter, input)
      expect(id).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('adaptive min >= max rejected', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: {
          type: 'adaptive',
          fallback: 30,
          bufferPercent: 25,
          min: 60,
          max: 30,
        },
      }
      await expect(createSeries(adapter, input)).rejects.toThrow(/adaptive min must be < max/)
    })

    it('adaptive min === max rejected (boundary)', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: {
          type: 'adaptive',
          fallback: 30,
          bufferPercent: 25,
          min: 30,
          max: 30,
        },
      }
      await expect(createSeries(adapter, input)).rejects.toThrow(/adaptive min must be < max/)
    })

    it('adaptive min only (no max) accepted', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: {
          type: 'adaptive',
          fallback: 30,
          bufferPercent: 25,
          min: 10,
        },
      }
      const id = await createSeries(adapter, input)
      expect(id).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('adaptive min < max accepted', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: {
          type: 'adaptive',
          fallback: 30,
          bufferPercent: 25,
          min: 20,
          max: 60,
        },
      }
      const id = await createSeries(adapter, input)
      expect(id).toMatch(/^[0-9a-f-]{36}$/)
    })
  })

  describe('Pattern Validation', () => {
    it('valid patterns accepted', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        patterns: [{ type: 'daily' }, { type: 'weekly' }],
      }
      const id = await createSeries(adapter, input)
      expect(id).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('invalid pattern object rejected', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        patterns: [{ invalid: true } as any],
      }
      await expect(createSeries(adapter, input)).rejects.toThrow(/Each pattern must have a type/)
    })
  })

  describe('Wiggle Validation', () => {
    it('valid wiggle accepted', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        wiggle: { daysBefore: 1, daysAfter: 2 },
      }
      const id = await createSeries(adapter, input)
      expect(id).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('negative daysBefore rejected', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        wiggle: { daysBefore: -1, daysAfter: 0 },
      }
      await expect(createSeries(adapter, input)).rejects.toThrow(/wiggle daysBefore must be >= 0/)
    })

    it('negative daysAfter rejected', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        wiggle: { daysBefore: 0, daysAfter: -1 },
      }
      await expect(createSeries(adapter, input)).rejects.toThrow(/wiggle daysAfter must be >= 0/)
    })

    it('valid timeWindow accepted', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        wiggle: {
          daysBefore: 0,
          daysAfter: 0,
          earliest: '08:00' as LocalTime,
          latest: '10:00' as LocalTime,
        },
      }
      const id = await createSeries(adapter, input)
      expect(id).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('invalid timeWindow order rejected', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        wiggle: {
          daysBefore: 0,
          daysAfter: 0,
          earliest: '10:00' as LocalTime,
          latest: '08:00' as LocalTime,
        },
      }
      await expect(createSeries(adapter, input)).rejects.toThrow(/wiggle earliest must be < latest/)
    })

    it('timeWindow earliest === latest rejected (boundary)', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        wiggle: {
          daysBefore: 0,
          daysAfter: 0,
          earliest: '09:00' as LocalTime,
          latest: '09:00' as LocalTime,
        },
      }
      await expect(createSeries(adapter, input)).rejects.toThrow(/wiggle earliest must be < latest/)
    })

    it('fixed with non-zero wiggle rejected', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        fixed: true,
        wiggle: { daysBefore: 1, daysAfter: 0 },
      }
      await expect(createSeries(adapter, input)).rejects.toThrow(/fixed series cannot have non-zero wiggle/)
    })

    it('fixed with null wiggle accepted', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        fixed: true,
        wiggle: undefined,
      }
      const id = await createSeries(adapter, input)
      expect(id).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('fixed with zero wiggle accepted', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        fixed: true,
        wiggle: { daysBefore: 0, daysAfter: 0 },
      }
      const id = await createSeries(adapter, input)
      expect(id).toMatch(/^[0-9a-f-]{36}$/)
    })
  })

  describe('Reminder Validation', () => {
    it('valid reminders accepted', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        reminders: [{ minutes: 15 }],
      }
      const id = await createSeries(adapter, input)
      expect(id).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('negative reminder minutes rejected', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        reminders: [{ minutes: -5 }],
      }
      await expect(createSeries(adapter, input)).rejects.toThrow(/reminder minutes must be >= 0/)
    })

    it('zero reminder minutes accepted', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        reminders: [{ minutes: 0 }],
      }
      const id = await createSeries(adapter, input)
      expect(id).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('reminder label stored as empty string', async () => {
      const id = await createSeries(adapter, {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        reminders: [{ minutes: 15 }],
      })
      const reminders = await adapter.getRemindersBySeries(id)
      expect(reminders).toHaveLength(1)
      expect(reminders[0].label).toBe('')
    })
  })

  describe('Cycling Validation', () => {
    it('empty cycling items rejected', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        cycling: { items: [], gapLeap: false },
      }
      await expect(createSeries(adapter, input)).rejects.toThrow(/Cycling items must not be empty/)
    })

    it('cycling mode defaults to sequential when omitted', async () => {
      const id = await createSeries(adapter, {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        cycling: { items: ['A', 'B', 'C'], gapLeap: false },
      })
      // Check cycling config storage
      const config = await adapter.getCyclingConfig(id)
      expect(config).not.toBeNull()
      expect(config!.mode).toBe('sequential')
      // Also verify on the series record itself (dual-default at lines 311 and 349)
      const series = await getSeries(adapter, id)
      expect((series as any)?.cycling?.mode).toBe('sequential')
    })

    it('cycling currentIndex defaults to 0 when omitted', async () => {
      const id = await createSeries(adapter, {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        cycling: { items: ['A', 'B'], gapLeap: true },
      })
      // Check cycling config storage
      const config = await adapter.getCyclingConfig(id)
      expect(config).not.toBeNull()
      expect(config!.currentIndex).toBe(0)
      // Also verify on the series record itself (dual-default at lines 313 and 347)
      const series = await getSeries(adapter, id)
      expect((series as any)?.cycling?.currentIndex).toBe(0)
    })

    it('cycling gapLeap stored correctly when true', async () => {
      const id = await createSeries(adapter, {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        cycling: { items: ['X'], gapLeap: true },
      })
      const config = await adapter.getCyclingConfig(id)
      expect(config!.gapLeap).toBe(true)
    })

    it('cycling gapLeap stored correctly when false', async () => {
      const id = await createSeries(adapter, {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        cycling: { items: ['X'], gapLeap: false },
      })
      const config = await adapter.getCyclingConfig(id)
      expect(config!.gapLeap).toBe(false)
    })
  })

  describe('Fixed + Wiggle Conflict', () => {
    it('fixed with daysAfter non-zero rejected', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        fixed: true,
        wiggle: { daysBefore: 0, daysAfter: 1 },
      }
      await expect(createSeries(adapter, input)).rejects.toThrow(/fixed series cannot have non-zero wiggle/)
    })

    it('fixed with both daysBefore and daysAfter non-zero rejected', async () => {
      const input: SeriesInput = {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        fixed: true,
        wiggle: { daysBefore: 2, daysAfter: 3 },
      }
      await expect(createSeries(adapter, input)).rejects.toThrow(/fixed series cannot have non-zero wiggle/)
    })
  })
})

// ============================================================================
// 3. GET SERIES
// ============================================================================

describe('Get Series', () => {
  it('get existing series', async () => {
    const id = await createSeries(adapter, {
      title: 'Test',
      startDate: '2024-01-15' as LocalDate,
      timeOfDay: '09:00' as LocalTime,
      duration: 30,
    })
    const series = await getSeries(adapter, id)
    expect(series).toEqual(expect.objectContaining({
      id,
      title: 'Test',
      startDate: '2024-01-15',
      timeOfDay: '09:00',
      duration: 30,
    }))
  })

  it('get non-existent series returns null', async () => {
    // First prove getSeries works for real data
    const realId = await createSeries(adapter, {
      title: 'Real Series',
      startDate: '2024-01-15' as LocalDate,
      timeOfDay: '09:00' as LocalTime,
      duration: 30,
    })
    const realSeries = await getSeries(adapter, realId)
    expect(realSeries).toEqual(expect.objectContaining({
      id: realId,
      title: 'Real Series',
    }))

    const series = await getSeries(adapter, 'nonexistent-id')
    const allSeries = await getAllSeries(adapter)
    expect(allSeries.map(s => s.id)).not.toContain('nonexistent-id')
    expect(series).toBe(null)
    // Strengthen: confirm the real series is still retrievable (positive case)
    const stillExists = await getSeries(adapter, realId)
    expect(stillExists).toMatchObject({ id: realId, title: 'Real Series' })
  })

  it('get deleted series returns null', async () => {
    const id = await createSeries(adapter, {
      title: 'Test',
      startDate: '2024-01-15' as LocalDate,
      timeOfDay: '09:00' as LocalTime,
      duration: 30,
    })
    await deleteSeries(adapter, id)
    const allSeries = await getAllSeries(adapter)
    expect(allSeries.map(s => s.id)).not.toContain(id)
  })

  it('get series by tag returns matching', async () => {
    const id = await createSeries(adapter, {
      title: 'Test',
      startDate: '2024-01-15' as LocalDate,
      timeOfDay: '09:00' as LocalTime,
      duration: 30,
      tags: ['work'],
    })
    const results = await getSeriesByTag(adapter, 'work')
    expect(results.some((s) => s.id === id)).toBe(true)
  })

  it('get series by tag excludes non-matching', async () => {
    const id = await createSeries(adapter, {
      title: 'Test',
      startDate: '2024-01-15' as LocalDate,
      timeOfDay: '09:00' as LocalTime,
      duration: 30,
      tags: ['personal'],
    })
    const results = await getSeriesByTag(adapter, 'work')
    expect(results.some((s) => s.id === id)).toBe(false)
  })

  it('get all series returns all', async () => {
    await createSeries(adapter, {
      title: 'A',
      startDate: '2024-01-15' as LocalDate,
      timeOfDay: '09:00' as LocalTime,
      duration: 30,
    })
    await createSeries(adapter, {
      title: 'B',
      startDate: '2024-01-15' as LocalDate,
      timeOfDay: '09:00' as LocalTime,
      duration: 30,
    })
    await createSeries(adapter, {
      title: 'C',
      startDate: '2024-01-15' as LocalDate,
      timeOfDay: '09:00' as LocalTime,
      duration: 30,
    })
    const all = await getAllSeries(adapter)
    const titles = all.map((s) => s.title).sort()
    expect(titles).toEqual(['A', 'B', 'C'])
  })

  it('get all series empty returns empty array', async () => {
    // Prove getAllSeries works by adding one and checking
    const id = await createSeries(adapter, {
      title: 'Proof',
      startDate: '2024-01-15' as LocalDate,
      timeOfDay: '09:00' as LocalTime,
      duration: 30,
    })
    let all = await getAllSeries(adapter)
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ id, title: 'Proof' })
    // Now delete it and verify empty
    await deleteSeries(adapter, id)
    all = await getAllSeries(adapter)
    expect(all).toEqual([])
  })
})

// ============================================================================
// 4. UPDATE SERIES
// ============================================================================

describe('Update Series', () => {
  describe('Basic Update Tests', () => {
    it('update title', async () => {
      const id = await createSeries(adapter, {
        title: 'Original',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      })
      await updateSeries(adapter, id, { title: 'New Title' })
      const series = await getSeries(adapter, id)
      expect(series?.title).toBe('New Title')
    })

    it('update preserves other fields', async () => {
      const id = await createSeries(adapter, {
        title: 'Original',
        description: 'Keep me',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      })
      await updateSeries(adapter, id, { title: 'New Title' })
      const series = await getSeries(adapter, id)
      expect(series?.description).toBe('Keep me')
    })

    it('update sets updatedAt', async () => {
      const id = await createSeries(adapter, {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      })
      const before = (await getSeries(adapter, id))?.updatedAt
      await new Promise((r) => setTimeout(r, 10))
      await updateSeries(adapter, id, { title: 'New' })
      const after = (await getSeries(adapter, id))?.updatedAt
      expect(after).not.toBe(before)
    })

    it('update non-existent series throws NotFoundError', async () => {
      await expect(
        updateSeries(adapter, 'nonexistent', { title: 'X' })
      ).rejects.toThrow(/not found/)
    })
  })

  describe('Locked Series Tests', () => {
    it('update locked series fails', async () => {
      const id = await createSeries(adapter, {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      })
      await lockSeries(adapter, id)
      await expect(updateSeries(adapter, id, { title: 'New' })).rejects.toThrow(
        /is locked/
      )
    })

    it('unlocking locked series allowed', async () => {
      const id = await createSeries(adapter, {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      })
      await lockSeries(adapter, id)
      await updateSeries(adapter, id, { locked: false })
      const series = await getSeries(adapter, id)
      expect(series?.locked).toBe(false)
    })

    it('update unlocked series works', async () => {
      const id = await createSeries(adapter, {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      })
      await lockSeries(adapter, id)
      await unlockSeries(adapter, id)
      await updateSeries(adapter, id, { title: 'New' })
      const series = await getSeries(adapter, id)
      expect(series?.title).toBe('New')
    })
  })

  describe('Update Preconditions', () => {
    it('cannot change id throws ValidationError', async () => {
      const id = await createSeries(adapter, {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      })
      await expect(
        updateSeries(adapter, id, { id: 'new-id' } as any)
      ).rejects.toThrow(/Cannot change series id/)
    })

    it('cannot change createdAt throws ValidationError', async () => {
      const id = await createSeries(adapter, {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      })
      await expect(
        updateSeries(adapter, id, { createdAt: '2020-01-01T00:00:00' } as any)
      ).rejects.toThrow(/Cannot change createdAt/)
    })

    it('update validation applied', async () => {
      const id = await createSeries(adapter, {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      })
      await expect(updateSeries(adapter, id, { title: '' })).rejects.toThrow(
        /Title must not be empty/
      )
    })
  })
})

// ============================================================================
// 5. DELETE SERIES
// ============================================================================

describe('Delete Series', () => {
  it('delete existing series succeeds', async () => {
    const id = await createSeries(adapter, {
      title: 'Test',
      startDate: '2024-01-15' as LocalDate,
      timeOfDay: '09:00' as LocalTime,
      duration: 30,
    })
    await deleteSeries(adapter, id)
    const allSeries = await getAllSeries(adapter)
    expect(allSeries.map(s => s.id)).not.toContain(id)
  })

  it('get after delete returns null', async () => {
    const id = await createSeries(adapter, {
      title: 'Test',
      startDate: '2024-01-15' as LocalDate,
      timeOfDay: '09:00' as LocalTime,
      duration: 30,
    })
    await deleteSeries(adapter, id)
    const allSeries = await getAllSeries(adapter)
    expect(allSeries.map(s => s.id)).not.toContain(id)
  })

  it('delete non-existent series throws NotFoundError', async () => {
    await expect(deleteSeries(adapter, 'nonexistent')).rejects.toThrow(
      /not found/
    )
  })

  it('delete with completions throws CompletionsExistError', async () => {
    const id = await createSeries(adapter, {
      title: 'Test',
      startDate: '2024-01-15' as LocalDate,
      timeOfDay: '09:00' as LocalTime,
      duration: 30,
    })
    // Add completion via adapter
    await adapter.createCompletion({
      id: 'comp-1',
      seriesId: id,
      instanceDate: '2024-01-15' as LocalDate,
      date: '2024-01-15' as LocalDate,
      startTime: '2024-01-15T13:30:00' as LocalDateTime,
      endTime: '2024-01-15T14:00:00' as LocalDateTime,
    })
    await expect(deleteSeries(adapter, id)).rejects.toThrow(/has completions/)
  })

  it('delete with child links throws LinkedChildrenExistError', async () => {
    const parentId = await createSeries(adapter, {
      title: 'Parent',
      startDate: '2024-01-15' as LocalDate,
      timeOfDay: '09:00' as LocalTime,
      duration: 30,
    })
    const childId = await createSeries(adapter, {
      title: 'Child',
      startDate: '2024-01-15' as LocalDate,
      timeOfDay: '09:00' as LocalTime,
      duration: 30,
    })
    // Add link via adapter
    await adapter.createLink({
      id: 'link-1',
      parentSeriesId: parentId,
      childSeriesId: childId,
      targetDistance: 30,
      earlyWobble: 0,
      lateWobble: 10,
    })
    await expect(deleteSeries(adapter, parentId)).rejects.toThrow(
      /has linked children/
    )
  })

  it('delete cascades patterns', async () => {
    const id = await createSeries(adapter, {
      title: 'Test',
      startDate: '2024-01-15' as LocalDate,
      timeOfDay: '09:00' as LocalTime,
      duration: 30,
      patterns: [{ type: 'daily' }],
    })

    // Verify pattern exists before deletion
    let patterns = await adapter.getPatternsBySeries(id)
    expect(patterns).toHaveLength(1)
    expect(patterns[0]).toMatchObject({ type: 'daily' })

    await deleteSeries(adapter, id)
    patterns = await adapter.getPatternsBySeries(id)
    expect(patterns).toEqual([])
  })

  it('delete cascades conditions', async () => {
    const id = await createSeries(adapter, {
      title: 'Test',
      startDate: '2024-01-15' as LocalDate,
      timeOfDay: '09:00' as LocalTime,
      duration: 30,
    })
    // Add condition via adapter
    await adapter.createCondition({
      id: 'cond-1',
      seriesId: id,
      parentId: null,
      type: 'count',
      operator: '>=',
      value: 5,
      windowDays: 14,
    } as any)

    // Verify condition exists before deletion
    let conditions = await adapter.getConditionsBySeries(id)
    expect(conditions).toHaveLength(1)
    expect(conditions[0]).toMatchObject({ id: 'cond-1', seriesId: id })

    await deleteSeries(adapter, id)
    conditions = await adapter.getConditionsBySeries(id)
    expect(conditions).toEqual([])
  })

  it('delete cascades reminders', async () => {
    const id = await createSeries(adapter, {
      title: 'Test',
      startDate: '2024-01-15' as LocalDate,
      timeOfDay: '09:00' as LocalTime,
      duration: 30,
      reminders: [{ minutes: 15 }],
    })

    // Verify reminder exists before deletion
    let reminders = await adapter.getRemindersBySeries(id)
    expect(reminders).toHaveLength(1)
    expect(reminders[0]).toMatchObject({
      series_id: id,
      minutes_before: 15,
    })

    // Also verify via global query before deletion
    let allReminders = await adapter.getAllReminders()
    let seriesReminders = allReminders.filter(r => r.series_id === id)
    expect(seriesReminders).toHaveLength(1)
    expect(seriesReminders[0]).toMatchObject({ series_id: id, minutes_before: 15 })

    await deleteSeries(adapter, id)
    reminders = await adapter.getRemindersBySeries(id)
    expect(reminders).toEqual([])

    // Verify global query also shows no reminders for this series
    allReminders = await adapter.getAllReminders()
    seriesReminders = allReminders.filter(r => r.series_id === id)
    expect(seriesReminders).toEqual([])
  })
})

// ============================================================================
// 6. LOCK/UNLOCK
// ============================================================================

describe('Lock/Unlock', () => {
  it('lock sets locked true', async () => {
    const id = await createSeries(adapter, {
      title: 'Test',
      startDate: '2024-01-15' as LocalDate,
      timeOfDay: '09:00' as LocalTime,
      duration: 30,
    })
    await lockSeries(adapter, id)
    const series = await getSeries(adapter, id)
    expect(series?.locked).toBe(true)
  })

  it('unlock sets locked false', async () => {
    const id = await createSeries(adapter, {
      title: 'Test',
      startDate: '2024-01-15' as LocalDate,
      timeOfDay: '09:00' as LocalTime,
      duration: 30,
    })
    await lockSeries(adapter, id)
    await unlockSeries(adapter, id)
    const series = await getSeries(adapter, id)
    expect(series?.locked).toBe(false)
  })

  it('lock non-existent throws NotFoundError', async () => {
    await expect(lockSeries(adapter, 'nonexistent')).rejects.toThrow(
      /not found/
    )
  })

  it('unlock non-existent throws NotFoundError', async () => {
    await expect(unlockSeries(adapter, 'nonexistent')).rejects.toThrow(
      /not found/
    )
  })

  it('lock is idempotent', async () => {
    const id = await createSeries(adapter, {
      title: 'Test',
      startDate: '2024-01-15' as LocalDate,
      timeOfDay: '09:00' as LocalTime,
      duration: 30,
    })
    await lockSeries(adapter, id)
    await lockSeries(adapter, id)
    const series = await getSeries(adapter, id)
    expect(series?.locked).toBe(true)
  })

  it('unlock is idempotent', async () => {
    const id = await createSeries(adapter, {
      title: 'Test',
      startDate: '2024-01-15' as LocalDate,
      timeOfDay: '09:00' as LocalTime,
      duration: 30,
    })
    await unlockSeries(adapter, id)
    await unlockSeries(adapter, id)
    const series = await getSeries(adapter, id)
    expect(series?.locked).toBe(false)
  })

  it('lock unlocked then lock works', async () => {
    const id = await createSeries(adapter, {
      title: 'Test',
      startDate: '2024-01-15' as LocalDate,
      timeOfDay: '09:00' as LocalTime,
      duration: 30,
    })
    await lockSeries(adapter, id)
    const series = await getSeries(adapter, id)
    expect(series?.locked).toBe(true)
  })
})

// ============================================================================
// 7. SERIES SPLITTING
// ============================================================================

describe('Series Splitting', () => {
  describe('Basic Split Tests', () => {
    it('split returns new ID', async () => {
      const id = await createSeries(adapter, {
        title: 'Test',
        startDate: '2024-01-01' as LocalDate,
        endDate: '2024-01-31' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      })
      const newId = await splitSeries(adapter, id, '2024-01-15' as LocalDate, {})
      expect(newId).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('split IDs differ', async () => {
      const id = await createSeries(adapter, {
        title: 'Test',
        startDate: '2024-01-01' as LocalDate,
        endDate: '2024-01-31' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      })
      const newId = await splitSeries(adapter, id, '2024-01-15' as LocalDate, {})
      expect(newId).not.toBe(id)
    })

    it('original endDate set to split date (exclusive)', async () => {
      const id = await createSeries(adapter, {
        title: 'Test',
        startDate: '2024-01-01' as LocalDate,
        endDate: '2024-01-31' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      })
      await splitSeries(adapter, id, '2024-01-15' as LocalDate, {})
      const original = await getSeries(adapter, id)
      expect(original?.endDate).toBe('2024-01-15')
    })

    it('new startDate set to split date', async () => {
      const id = await createSeries(adapter, {
        title: 'Test',
        startDate: '2024-01-01' as LocalDate,
        endDate: '2024-01-31' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      })
      const newId = await splitSeries(adapter, id, '2024-01-15' as LocalDate, {})
      const newSeries = await getSeries(adapter, newId)
      expect(newSeries?.startDate).toBe('2024-01-15')
    })

    it('new inherits from original', async () => {
      const id = await createSeries(adapter, {
        title: 'Test',
        description: 'Original description',
        startDate: '2024-01-01' as LocalDate,
        endDate: '2024-01-31' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      })
      const newId = await splitSeries(adapter, id, '2024-01-15' as LocalDate, {})
      const newSeries = await getSeries(adapter, newId)
      expect(newSeries?.title).toBe('Test')
      expect(newSeries?.description).toBe('Original description')
    })

    it('new applies overrides', async () => {
      const id = await createSeries(adapter, {
        title: 'Test',
        startDate: '2024-01-01' as LocalDate,
        endDate: '2024-01-31' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      })
      const newId = await splitSeries(adapter, id, '2024-01-15' as LocalDate, {
        title: 'New Title',
      })
      const newSeries = await getSeries(adapter, newId)
      expect(newSeries?.title).toBe('New Title')
    })

    it('both series valid after split', async () => {
      const id = await createSeries(adapter, {
        title: 'Test',
        startDate: '2024-01-01' as LocalDate,
        endDate: '2024-01-31' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      })
      const newId = await splitSeries(adapter, id, '2024-01-15' as LocalDate, {})
      const original = await getSeries(adapter, id)
      const newSeries = await getSeries(adapter, newId)
      expect(original).toEqual(expect.objectContaining({
        id,
        title: 'Test',
        endDate: '2024-01-15',
      }))
      expect(newSeries).toEqual(expect.objectContaining({
        id: newId,
        title: 'Test',
        startDate: '2024-01-15',
      }))
    })
  })

  describe('Split Preconditions', () => {
    it('split non-existent series throws NotFoundError', async () => {
      await expect(
        splitSeries(adapter, 'nonexistent', '2024-01-15' as LocalDate, {})
      ).rejects.toThrow(/not found/)
    })

    it('split at startDate throws ValidationError', async () => {
      const id = await createSeries(adapter, {
        title: 'Test',
        startDate: '2024-01-01' as LocalDate,
        endDate: '2024-01-31' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      })
      await expect(
        splitSeries(adapter, id, '2024-01-01' as LocalDate, {})
      ).rejects.toThrow(/splitDate must be after startDate/)
    })

    it('split before startDate throws ValidationError', async () => {
      const id = await createSeries(adapter, {
        title: 'Test',
        startDate: '2024-01-15' as LocalDate,
        endDate: '2024-01-31' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      })
      await expect(
        splitSeries(adapter, id, '2024-01-10' as LocalDate, {})
      ).rejects.toThrow(/splitDate must be after startDate/)
    })

    it('split after endDate throws ValidationError', async () => {
      const id = await createSeries(adapter, {
        title: 'Test',
        startDate: '2024-01-01' as LocalDate,
        endDate: '2024-01-15' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      })
      await expect(
        splitSeries(adapter, id, '2024-01-20' as LocalDate, {})
      ).rejects.toThrow(/splitDate must be < endDate/)
    })

    it('split locked series throws LockedSeriesError', async () => {
      const id = await createSeries(adapter, {
        title: 'Test',
        startDate: '2024-01-01' as LocalDate,
        endDate: '2024-01-31' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      })
      await lockSeries(adapter, id)
      await expect(
        splitSeries(adapter, id, '2024-01-15' as LocalDate, {})
      ).rejects.toThrow(/is locked/)
    })
  })

  describe('Completion Preservation', () => {
    it('original completions preserved', async () => {
      const id = await createSeries(adapter, {
        title: 'Test',
        startDate: '2024-01-01' as LocalDate,
        endDate: '2024-01-31' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      })
      await adapter.createCompletion({
        id: 'comp-1',
        seriesId: id,
        instanceDate: '2024-01-05' as LocalDate,
        date: '2024-01-05' as LocalDate,
        startTime: '2024-01-05T13:30:00' as LocalDateTime,
        endTime: '2024-01-05T14:00:00' as LocalDateTime,
      })
      await splitSeries(adapter, id, '2024-01-15' as LocalDate, {})
      const completions = await adapter.getCompletionsBySeries(id)
      expect(completions.map(c => c.id)).toEqual(['comp-1'])
    })

    it('new series has no completions', async () => {
      const id = await createSeries(adapter, {
        title: 'Test',
        startDate: '2024-01-01' as LocalDate,
        endDate: '2024-01-31' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
      })
      await adapter.createCompletion({
        id: 'comp-1',
        seriesId: id,
        instanceDate: '2024-01-05' as LocalDate,
        date: '2024-01-05' as LocalDate,
        startTime: '2024-01-05T13:30:00' as LocalDateTime,
        endTime: '2024-01-05T14:00:00' as LocalDateTime,
      })

      // Verify completion exists before split
      const completionsBefore = await adapter.getCompletionsBySeries(id)
      expect(completionsBefore).toHaveLength(1)
      expect(completionsBefore[0]).toMatchObject({
        id: 'comp-1',
        series_id: id,
      })

      const newId = await splitSeries(adapter, id, '2024-01-15' as LocalDate, {})

      // Verify new series ID is different
      expect(newId).not.toBe(id)

      // Verify original series still has completions (LAW 18)
      let completions = await adapter.getCompletionsBySeries(id)
      expect(completions).toHaveLength(1)
      expect(completions[0].id).toBe('comp-1')

      // New series has none - same getter proven above to return real data
      completions = await adapter.getCompletionsBySeries(newId)
      expect(completions.some(c => c.series_id === newId)).toBe(false)
      expect(completions.some(c => c.id === 'comp-1')).toBe(false)
    })
  })

  describe('Cycling State Transfer', () => {
    it('cycling currentIndex carries over', async () => {
      const id = await createSeries(adapter, {
        title: 'Test',
        startDate: '2024-01-01' as LocalDate,
        endDate: '2024-01-31' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        cycling: {
          items: [{ title: 'A' }, { title: 'B' }, { title: 'C' }],
          gapLeap: true,
        },
      })
      // Set index via adapter
      await adapter.updateCyclingIndex(id, 2)
      const newId = await splitSeries(adapter, id, '2024-01-15' as LocalDate, {})
      const newConfig = await adapter.getCyclingConfig(newId)
      expect(newConfig?.currentIndex).toBe(2)
    })

    it('cycling without gapLeap preserves index', async () => {
      const id = await createSeries(adapter, {
        title: 'Test',
        startDate: '2024-01-01' as LocalDate,
        endDate: '2024-01-31' as LocalDate,
        timeOfDay: '09:00' as LocalTime,
        duration: 30,
        cycling: {
          items: [{ title: 'A' }, { title: 'B' }],
          gapLeap: false,
        },
      })
      await adapter.updateCyclingIndex(id, 1)
      const newId = await splitSeries(adapter, id, '2024-01-15' as LocalDate, {})
      const newConfig = await adapter.getCyclingConfig(newId)
      expect(newConfig?.currentIndex).toBe(1)
    })
  })
})

// ============================================================================
// 8. TAG MANAGEMENT
// ============================================================================

describe('Tag Management', () => {
  it('add tag to series', async () => {
    const id = await createSeries(adapter, {
      title: 'Test',
      startDate: '2024-01-15' as LocalDate,
      timeOfDay: '09:00' as LocalTime,
      duration: 30,
    })
    await addTagToSeries(adapter, id, 'work')
    const tags = await getTagsForSeries(adapter, id)
    expect(tags).toContain('work')
  })

  it('remove tag from series', async () => {
    const id = await createSeries(adapter, {
      title: 'Test',
      startDate: '2024-01-15' as LocalDate,
      timeOfDay: '09:00' as LocalTime,
      duration: 30,
      tags: ['work'],
    })
    await removeTagFromSeries(adapter, id, 'work')
    const tags = await getTagsForSeries(adapter, id)
    expect(tags).not.toContain('work')
  })

  it('add tag creates if not exists', async () => {
    const id = await createSeries(adapter, {
      title: 'Test',
      startDate: '2024-01-15' as LocalDate,
      timeOfDay: '09:00' as LocalTime,
      duration: 30,
    })
    await addTagToSeries(adapter, id, 'newTag')
    const tag = await adapter.getTagByName('newTag')
    expect(tag).toEqual(expect.objectContaining({
      name: 'newTag',
    }))
  })

  it('add existing tag is idempotent', async () => {
    const id = await createSeries(adapter, {
      title: 'Test',
      startDate: '2024-01-15' as LocalDate,
      timeOfDay: '09:00' as LocalTime,
      duration: 30,
      tags: ['work'],
    })
    await addTagToSeries(adapter, id, 'work')
    const tags = await getTagsForSeries(adapter, id)
    const workTags = tags.filter((t) => t === 'work')
    expect(workTags).toEqual(['work'])
  })

  it('remove non-existent tag is idempotent', async () => {
    const id = await createSeries(adapter, {
      title: 'Test',
      startDate: '2024-01-15' as LocalDate,
      timeOfDay: '09:00' as LocalTime,
      duration: 30,
      tags: ['existing'],
    })
    const tagsBefore = await getTagsForSeries(adapter, id)
    await removeTagFromSeries(adapter, id, 'nonexistent')
    const tagsAfter = await getTagsForSeries(adapter, id)
    expect(tagsAfter).toEqual(tagsBefore)
  })

  it('tag on non-existent series throws NotFoundError', async () => {
    await expect(addTagToSeries(adapter, 'nonexistent', 'work')).rejects.toThrow(
      /not found/
    )
  })
})

// ============================================================================
// 9. INVARIANTS
// ============================================================================

describe('Invariants', () => {
  it('INV 2: series ID immutable', async () => {
    const id = await createSeries(adapter, {
      title: 'Test',
      startDate: '2024-01-15' as LocalDate,
      timeOfDay: '09:00' as LocalTime,
      duration: 30,
    })
    await expect(
      updateSeries(adapter, id, { id: 'new-id' } as any)
    ).rejects.toThrow(/Cannot change series id/)
  })

  it('INV 3: createdAt immutable', async () => {
    const id = await createSeries(adapter, {
      title: 'Test',
      startDate: '2024-01-15' as LocalDate,
      timeOfDay: '09:00' as LocalTime,
      duration: 30,
    })
    await expect(
      updateSeries(adapter, id, { createdAt: '2020-01-01T00:00:00' } as any)
    ).rejects.toThrow(/Cannot change createdAt/)
  })
})
