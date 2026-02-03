# Fuzz Testing Suite

Property-based testing suite for the autoplanner library.

## Directory Structure

- `generators/` - Primitive and domain model generators for test data generation
- `properties/` - Property-based tests organized by specification segment
- `invariants/` - Invariant checker functions that validate system state
- `state-machine/` - State machine model, operation generators, and equivalence testing
- `stress/` - Constraint satisfaction fuzzing and performance stress tests
- `shrinking/` - Custom shrinker implementations for minimal counterexamples
- `lib/` - Shared utilities, types, and test harness infrastructure

## Running Tests

```bash
# Run all fuzz tests
npm run test:fuzz

# Run with specific iteration count
FUZZ_ITERATIONS=10000 npm run test:fuzz

# Run specific test file
npx vitest tests/fuzz/properties/temporal.test.ts
```
