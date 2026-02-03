## What You're Looking For

### No-Op Tests

Tests that do nothing or assert nothing meaningful:

```typescript
// BAD - No assertion
it('handles edge case', () => {
  const store = createStore()
  store.doSomething()  // No expect()
})

// BAD - Meaningless assertion
it('validates input', () => {
  expect(true).toBe(true)
})

// BAD - Asserts existence only when behavior should be tested
it('processes data correctly', () => {
  const result = process(data)
  expect(result).toBeDefined()  // Should verify actual content
})
```

### Incomplete Assertions

Tests that only partially verify the requirement:

```typescript
// BAD - TESTS.md says "returns object with x, y, z" but only checks x
it('returns complete result object', () => {
  const result = calculate()
  expect(result.x).toBe(10)
  // Missing checks for y and z
})

// BAD - Only checks happy path when error should be verified
it('throws ValidationError for invalid input', () => {
  expect(() => validate('')).toThrow()  // Should verify it's ValidationError specifically
})
```

### Hardcoded Passes

Tests rigged to pass regardless of implementation:

```typescript
// BAD - Mocking the thing being tested
it('calculates total', () => {
  vi.spyOn(calculator, 'total').mockReturnValue(100)
  expect(calculator.total()).toBe(100)  // This tests the mock, not the code
})

// BAD - Conditional logic that skips the real test
it('handles async operation', async () => {
  if (!navigator.onLine) return  // Skips test silently
  // actual test
})
```

### Wrong Test Names

Tests whose names don't match what they actually test:

```typescript
// BAD - Name says one thing, test does another
it('validates email format', () => {
  const store = createStore()
  expect(store.get('name')).toBeUndefined()  // Has nothing to do with email
})
```

### Swallowed Errors

Tests that catch errors without verifying them:

```typescript
// BAD - Catches error but doesn't verify it
it('throws on invalid input', () => {
  try {
    doSomething(null)
  } catch (e) {
    // Empty catch or just "expect(true)"
  }
})
```

### Skipped or Commented Tests

```typescript
// BAD - Skipped tests count as missing
it.skip('handles edge case', () => { })
it.todo('needs implementation')
// it('commented out test', () => { })
```

### Overly Loose Assertions

```typescript
// BAD - Too permissive
it('returns correct data', () => {
  const result = getData()
  expect(result).toBeTruthy()  // Should check actual value
  expect(typeof result).toBe('object')  // Should check shape
  expect(Array.isArray(result.items)).toBe(true)  // Should check contents
})

// BAD - Using toContain when exact match needed
it('returns exact list', () => {
  const result = getList()
  expect(result).toContain('item1')  // Doesn't verify complete list
})
```

### Missing Error Case Tests

Check TESTS.md for error cases like "throws X when Y" and verify they:
- Actually trigger the error condition
- Verify the specific error type
- Verify the error message if specified

### Copy-Paste Errors

Tests that were copy-pasted and not updated:

```typescript
// BAD - Same test twice with different names
it('handles case A', () => {
  expect(process('a')).toBe('A')
})
it('handles case B', () => {
  expect(process('a')).toBe('A')  // Should be 'b' and 'B'
})
```
