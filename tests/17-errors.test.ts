/**
 * Segment 17: Error System Tests
 *
 * Tests the consolidated error system in errors.ts:
 * AutoplannerError base class, error code enum, and all error subclasses.
 */

import { describe, it, expect } from 'vitest'
import {
  AutoplannerError,
  AutoplannerErrorCode,
  DuplicateKeyError,
  NotFoundError,
  ForeignKeyError,
  InvalidDataError,
  ValidationError,
  LockedSeriesError,
  CompletionsExistError,
  LinkedChildrenExistError,
  NonExistentInstanceError,
  AlreadyCancelledError,
  CancelledInstanceError,
  CycleDetectedError,
  ChainDepthExceededError,
  DuplicateCompletionError,
  ParseError,
  InvalidPatternError,
  InvalidRangeError,
  InvalidConditionError,
} from '../src/errors'

describe('Segment 17: Error System', () => {
  // ========================================================================
  // AutoplannerError Base Class
  // ========================================================================

  describe('AutoplannerError base class', () => {
    it('constructor sets code and message', () => {
      const err = new AutoplannerError(AutoplannerErrorCode.NOT_FOUND, 'test message')
      expect(err.code).toBe('NOT_FOUND')
      expect(err.message).toBe('test message')
    })

    it('is instanceof Error with correct message', () => {
      const err = new AutoplannerError(AutoplannerErrorCode.VALIDATION, 'validation failed')
      expect(err).toBeInstanceOf(AutoplannerError)
      expect(err.message).toBe('validation failed')
      expect(err.code).toBe('VALIDATION')
    })

    it('is instanceof AutoplannerError', () => {
      const err = new AutoplannerError(AutoplannerErrorCode.VALIDATION, 'x')
      expect(err).toBeInstanceOf(AutoplannerError)
    })

    it('name property is AutoplannerError', () => {
      const err = new AutoplannerError(AutoplannerErrorCode.VALIDATION, 'x')
      expect(err.name).toBe('AutoplannerError')
    })
  })

  // ========================================================================
  // AutoplannerErrorCode Enum
  // ========================================================================

  describe('AutoplannerErrorCode enum', () => {
    it('has exactly 18 unique code values', () => {
      const values = Object.values(AutoplannerErrorCode)
      expect(values).toHaveLength(18)
      expect(new Set(values).size).toBe(18)
      expect(values[0]).toBe('DUPLICATE_KEY')
    })

    it('code values match their key names', () => {
      for (const [key, value] of Object.entries(AutoplannerErrorCode)) {
        expect(value).toBe(key)
      }
    })
  })

  // ========================================================================
  // Error Subclasses (parametric)
  // ========================================================================

  const errorClasses = [
    { Class: DuplicateKeyError, code: 'DUPLICATE_KEY', name: 'DuplicateKeyError' },
    { Class: NotFoundError, code: 'NOT_FOUND', name: 'NotFoundError' },
    { Class: ForeignKeyError, code: 'FOREIGN_KEY', name: 'ForeignKeyError' },
    { Class: InvalidDataError, code: 'INVALID_DATA', name: 'InvalidDataError' },
    { Class: ValidationError, code: 'VALIDATION', name: 'ValidationError' },
    { Class: LockedSeriesError, code: 'LOCKED_SERIES', name: 'LockedSeriesError' },
    { Class: CompletionsExistError, code: 'COMPLETIONS_EXIST', name: 'CompletionsExistError' },
    { Class: LinkedChildrenExistError, code: 'LINKED_CHILDREN_EXIST', name: 'LinkedChildrenExistError' },
    { Class: NonExistentInstanceError, code: 'NON_EXISTENT_INSTANCE', name: 'NonExistentInstanceError' },
    { Class: AlreadyCancelledError, code: 'ALREADY_CANCELLED', name: 'AlreadyCancelledError' },
    { Class: CancelledInstanceError, code: 'CANCELLED_INSTANCE', name: 'CancelledInstanceError' },
    { Class: CycleDetectedError, code: 'CYCLE_DETECTED', name: 'CycleDetectedError' },
    { Class: ChainDepthExceededError, code: 'CHAIN_DEPTH_EXCEEDED', name: 'ChainDepthExceededError' },
    { Class: DuplicateCompletionError, code: 'DUPLICATE_COMPLETION', name: 'DuplicateCompletionError' },
    { Class: ParseError, code: 'PARSE_ERROR', name: 'ParseError' },
    { Class: InvalidPatternError, code: 'INVALID_PATTERN', name: 'InvalidPatternError' },
    { Class: InvalidRangeError, code: 'INVALID_RANGE', name: 'InvalidRangeError' },
    { Class: InvalidConditionError, code: 'INVALID_CONDITION', name: 'InvalidConditionError' },
  ] as const

  describe('Error subclasses', () => {
    for (const { Class, code, name } of errorClasses) {
      describe(name, () => {
        it(`code is ${code}`, () => {
          const err = new Class('test')
          expect(err.code).toBe(code)
        })

        it(`name is ${name}`, () => {
          const err = new Class('test')
          expect(err.name).toBe(name)
        })

        it('instanceof chain: subclass -> AutoplannerError', () => {
          const err = new Class('test')
          expect(err).toBeInstanceOf(Class)
          expect(err).toBeInstanceOf(AutoplannerError)
          expect(err.message).toBe('test')
        })

        it('message propagates correctly', () => {
          const msg = `${name} specific message`
          const err = new Class(msg)
          expect(err.message).toBe(msg)
        })
      })
    }
  })
})
