/**
 * Consolidated error system for @motioneffector/autoplanner.
 *
 * All error classes extend AutoplannerError, which carries a typed error code.
 * Modules re-export the classes they throw so existing import paths continue to work.
 */

// ============================================================================
// Error Codes
// ============================================================================

export const AutoplannerErrorCode = {
  // Adapter layer
  DUPLICATE_KEY: 'DUPLICATE_KEY',
  NOT_FOUND: 'NOT_FOUND',
  FOREIGN_KEY: 'FOREIGN_KEY',
  INVALID_DATA: 'INVALID_DATA',

  // Series CRUD
  VALIDATION: 'VALIDATION',
  LOCKED_SERIES: 'LOCKED_SERIES',
  COMPLETIONS_EXIST: 'COMPLETIONS_EXIST',
  LINKED_CHILDREN_EXIST: 'LINKED_CHILDREN_EXIST',

  // Public API
  NON_EXISTENT_INSTANCE: 'NON_EXISTENT_INSTANCE',
  ALREADY_CANCELLED: 'ALREADY_CANCELLED',
  CANCELLED_INSTANCE: 'CANCELLED_INSTANCE',
  CYCLE_DETECTED: 'CYCLE_DETECTED',
  CHAIN_DEPTH_EXCEEDED: 'CHAIN_DEPTH_EXCEEDED',
  DUPLICATE_COMPLETION: 'DUPLICATE_COMPLETION',

  // Time & date
  PARSE_ERROR: 'PARSE_ERROR',

  // Pattern expansion
  INVALID_PATTERN: 'INVALID_PATTERN',
  INVALID_RANGE: 'INVALID_RANGE',

  // Condition evaluation
  INVALID_CONDITION: 'INVALID_CONDITION',
} as const

export type AutoplannerErrorCode = (typeof AutoplannerErrorCode)[keyof typeof AutoplannerErrorCode]

// ============================================================================
// Base Class
// ============================================================================

export class AutoplannerError extends Error {
  readonly code: AutoplannerErrorCode

  constructor(code: AutoplannerErrorCode, message: string) {
    super(message)
    this.name = 'AutoplannerError'
    this.code = code
  }
}

// ============================================================================
// Adapter Errors
// ============================================================================

export class DuplicateKeyError extends AutoplannerError {
  constructor(message: string) {
    super(AutoplannerErrorCode.DUPLICATE_KEY, message)
    this.name = 'DuplicateKeyError'
  }
}

export class NotFoundError extends AutoplannerError {
  constructor(message: string) {
    super(AutoplannerErrorCode.NOT_FOUND, message)
    this.name = 'NotFoundError'
  }
}

export class ForeignKeyError extends AutoplannerError {
  constructor(message: string) {
    super(AutoplannerErrorCode.FOREIGN_KEY, message)
    this.name = 'ForeignKeyError'
  }
}

export class InvalidDataError extends AutoplannerError {
  constructor(message: string) {
    super(AutoplannerErrorCode.INVALID_DATA, message)
    this.name = 'InvalidDataError'
  }
}

// ============================================================================
// Series CRUD Errors
// ============================================================================

export class ValidationError extends AutoplannerError {
  constructor(message: string) {
    super(AutoplannerErrorCode.VALIDATION, message)
    this.name = 'ValidationError'
  }
}

export class LockedSeriesError extends AutoplannerError {
  constructor(message: string) {
    super(AutoplannerErrorCode.LOCKED_SERIES, message)
    this.name = 'LockedSeriesError'
  }
}

export class CompletionsExistError extends AutoplannerError {
  constructor(message: string) {
    super(AutoplannerErrorCode.COMPLETIONS_EXIST, message)
    this.name = 'CompletionsExistError'
  }
}

export class LinkedChildrenExistError extends AutoplannerError {
  constructor(message: string) {
    super(AutoplannerErrorCode.LINKED_CHILDREN_EXIST, message)
    this.name = 'LinkedChildrenExistError'
  }
}

// ============================================================================
// Public API Errors
// ============================================================================

export class NonExistentInstanceError extends AutoplannerError {
  constructor(message: string) {
    super(AutoplannerErrorCode.NON_EXISTENT_INSTANCE, message)
    this.name = 'NonExistentInstanceError'
  }
}

export class AlreadyCancelledError extends AutoplannerError {
  constructor(message: string) {
    super(AutoplannerErrorCode.ALREADY_CANCELLED, message)
    this.name = 'AlreadyCancelledError'
  }
}

export class CancelledInstanceError extends AutoplannerError {
  constructor(message: string) {
    super(AutoplannerErrorCode.CANCELLED_INSTANCE, message)
    this.name = 'CancelledInstanceError'
  }
}

export class CycleDetectedError extends AutoplannerError {
  constructor(message: string) {
    super(AutoplannerErrorCode.CYCLE_DETECTED, message)
    this.name = 'CycleDetectedError'
  }
}

export class ChainDepthExceededError extends AutoplannerError {
  constructor(message: string) {
    super(AutoplannerErrorCode.CHAIN_DEPTH_EXCEEDED, message)
    this.name = 'ChainDepthExceededError'
  }
}

export class DuplicateCompletionError extends AutoplannerError {
  constructor(message: string) {
    super(AutoplannerErrorCode.DUPLICATE_COMPLETION, message)
    this.name = 'DuplicateCompletionError'
  }
}

// ============================================================================
// Time & Date Errors
// ============================================================================

export class ParseError extends AutoplannerError {
  constructor(message: string) {
    super(AutoplannerErrorCode.PARSE_ERROR, message)
    this.name = 'ParseError'
  }
}

// ============================================================================
// Pattern Expansion Errors
// ============================================================================

export class InvalidPatternError extends AutoplannerError {
  constructor(message: string) {
    super(AutoplannerErrorCode.INVALID_PATTERN, message)
    this.name = 'InvalidPatternError'
  }
}

export class InvalidRangeError extends AutoplannerError {
  constructor(message: string) {
    super(AutoplannerErrorCode.INVALID_RANGE, message)
    this.name = 'InvalidRangeError'
  }
}

// ============================================================================
// Condition Evaluation Errors
// ============================================================================

export class InvalidConditionError extends AutoplannerError {
  constructor(message: string) {
    super(AutoplannerErrorCode.INVALID_CONDITION, message)
    this.name = 'InvalidConditionError'
  }
}
