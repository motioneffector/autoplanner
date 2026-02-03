# Autoplanner Test Implementation Tasklist

## Instructions for Loading This Tasklist

This is life-critical software. People will depend on this system to manage important aspects of their lives. The testing process below has been carefully designed with intentional repetition to maintain context accuracy across a long workflow. Your job is to load this tasklist into your task list tool exactly as written.

### How to Load

1. **Read this entire document first.** Scroll through and observe the structure before creating any tasks.

2. **Create one task for each checklist item.** Each `- [ ] **Title**` line becomes a separate task. Use the title as the task subject. Use the indented description as the task description. Copy both verbatim.

3. **Preserve the exact sequence.** After creating each task, set it as blocked by the previous task using `addBlockedBy`. Task 2 is blocked by Task 1. Task 3 is blocked by Task 2. And so on, through all 368 tasks. This creates a single sequential chain.

4. **Work through tasks one at a time.** When you begin work, claim the first unblocked task, complete it fully, mark it complete, then claim the next. Each task receives your full attention before moving on.

### Why This Structure Exists

The repetition in this document is intentional and meaningful. You will see "Load project notes into context" appear multiple times. You will see "Read TEST-AUDIT.md" appear sixteen times. Each instance exists because context fades over long workflows, and re-reading ensures accuracy at critical junctures.

Similarly, the sequential blocking exists because this workflow has hidden dependencies. Even tasks that appear independent benefit from the accumulated understanding built by completing prior tasks in order. The sequence has been designed with care.

### Test File Locations

All test files go in `tests/` under the autoplanner root. Name files by segment number and topic:

```
tests/
  01-time-date.test.ts
  02-pattern-expansion.test.ts
  03-condition-evaluation.test.ts
  04-adapter.test.ts
  05-series-crud.test.ts
  06-completions.test.ts
  07-cycling.test.ts
  08-adaptive-duration.test.ts
  09-instance-exceptions.test.ts
  10-reminders.test.ts
  11-links.test.ts
  12-relational-constraints.test.ts
  13-reflow-algorithm.test.ts
  14-public-api.test.ts
  15-sqlite-adapter.test.ts
  16-integration.test.ts
```

Use Vitest as the test framework. Each file should be self-contained with its own imports and setup. Every test matters - this is life-critical software.

### What Success Looks Like

When you finish loading, your task list will contain 368 individual tasks in a single chain. Each task's description will match this document word-for-word. The first task will be unblocked and ready to claim. All others will be blocked, waiting their turn.

### Checkpoint: Wait for Confirmation

After loading all 368 tasks, **stop and report to the user.** Show them the total count. Let them verify that the tasks loaded correctly and the chain is properly formed. Wait for their explicit confirmation before beginning any work.

This checkpoint exists because correcting a mis-loaded tasklist is far easier than recovering from work done against the wrong plan.

### Once Confirmed: Autonomous Execution

When the user confirms the tasklist is correct, begin work and continue autonomously through all 368 tasks to completion. Claim each task, complete it fully, mark it done, then immediately proceed to the next. Maintain this rhythm without pausing for approval between tasks.

The documents you are asked to read will be read in full. The tests you write will be thorough. The reviews will be careful. The audits will be rigorous. Lives will depend on the correctness of this software. You will complete the entire sequence with the care that demands.

This is the process. Trust it.

---

## Tasklist

- [ ] **Load project notes into context**

  Read all documents in `notes/` except testing-spec documents to understand the project architecture, requirements, and design decisions. **Do this even if you believe you have read these recently.** This is life-critical software; full context is essential. Files to read:
  - `concepts.md` - Core domain concepts
  - `requirements.md` - Functional requirements
  - `architecture-decisions.md` - Key design choices
  - `type-shapes.md` - Type definitions
  - `schema.md` - Database schema
  - `adapter-interface.md` - Storage adapter contract
  - `api-surface.md` - Public API shape
  - `recurrence-patterns.md` - Pattern syntax and semantics
  - `condition-syntax.md` - Condition DSL
  - `reflow-algorithm.md` - Scheduling algorithm overview
  - `testing-plan.md` - Original testing outline

  Exclude testing-spec documents as they are large and will be read individually during later steps.

- [ ] **Read testing-spec-01-time-date.md**

  Read the formal specification for the time and date system. Understand the types (LocalDate, LocalTime, LocalDateTime, Duration, DateRange), parsing/formatting rules, arithmetic operations, timezone conversion, and all laws/invariants that must hold.

- [ ] **Write test-plan-01.md**

  Write a document at `notes/test-plan-01.md` listing each test that will be needed for the time/date module. Include:
  - Test names and descriptions
  - Input values and expected outputs
  - Which laws/invariants each test verifies
  - Boundary conditions to cover
  - Property-based test specifications

  Ensure full coverage of the 50+ laws in testing-spec-01-time-date.md.

- [ ] **Review test-plan-01.md against spec**

  Re-read testing-spec-01-time-date.md and compare against test-plan-01.md. Verify every law, invariant, boundary condition, and error case in the spec has a corresponding test in the plan. If gaps exist, update the test plan before proceeding. Missing tests in life-critical software are unacceptable.

- [ ] **Commit test plan for segment 01**

  Stage and commit `notes/test-plan-01.md`. Use message: "Add test plan for segment 01: time and date"

- [ ] **Read testing-spec-02-pattern-expansion.md**

  Read the formal specification for pattern expansion. Understand pattern types (daily, everyNDays, weekdays, monthly, yearly, everyNWeeks), exception patterns, condition bindings, and expansion algorithms. Note the Feb 29 leap year handling and exception precedence rules.

- [ ] **Write test-plan-02.md**

  Write a document at `notes/test-plan-02.md` listing each test for pattern expansion. Include:
  - Tests for each pattern type
  - Bound vs unbounded expansion tests
  - Exception pattern application tests
  - Condition binding tests
  - Leap year edge cases (Feb 29)
  - Property-based tests for algebraic laws

  Ensure adherence to testing-spec-02-pattern-expansion.md.

- [ ] **Review test-plan-02.md against spec**

  Re-read testing-spec-02-pattern-expansion.md and compare against test-plan-02.md. Verify every law, invariant, boundary condition, and error case in the spec has a corresponding test in the plan. If gaps exist, update the test plan before proceeding.

- [ ] **Commit test plan for segment 02**

  Stage and commit `notes/test-plan-02.md`. Use message: "Add test plan for segment 02: pattern expansion"

- [ ] **Read testing-spec-03-condition-evaluation.md**

  Read the formal specification for condition evaluation. Understand condition types (count, daysSince, and, or, not), target resolution, window semantics, and evaluation rules. Note the handling of never-completed cases for each operator.

- [ ] **Write test-plan-03.md**

  Write a document at `notes/test-plan-03.md` listing each test for condition evaluation. Include:
  - Tests for each condition type
  - Tests for each comparison operator (including !=)
  - Target resolution tests (tag vs seriesId)
  - Window boundary tests
  - Never-completed edge cases
  - Compound condition tests (and/or/not)

  Ensure adherence to testing-spec-03-condition-evaluation.md.

- [ ] **Review test-plan-03.md against spec**

  Re-read testing-spec-03-condition-evaluation.md and compare against test-plan-03.md. Verify every law, invariant, boundary condition, and error case in the spec has a corresponding test in the plan. If gaps exist, update the test plan before proceeding.

- [ ] **Commit test plan for segment 03**

  Stage and commit `notes/test-plan-03.md`. Use message: "Add test plan for segment 03: condition evaluation"

- [ ] **Read testing-spec-04-adapter.md**

  Read the formal specification for the storage adapter interface. Understand the contract that both mock and SQLite adapters must fulfill, including CRUD operations, query methods, and transactional semantics.

- [ ] **Write test-plan-04.md**

  Write a document at `notes/test-plan-04.md` listing each test for the adapter interface. Include:
  - Contract tests that both adapters must pass
  - CRUD operation tests for each entity type
  - Query method tests
  - FK enforcement tests (link parent/child)
  - Transaction rollback tests

  Ensure adherence to testing-spec-04-adapter.md.

- [ ] **Review test-plan-04.md against spec**

  Re-read testing-spec-04-adapter.md and compare against test-plan-04.md. Verify every law, invariant, boundary condition, and error case in the spec has a corresponding test in the plan. If gaps exist, update the test plan before proceeding.

- [ ] **Commit test plan for segment 04**

  Stage and commit `notes/test-plan-04.md`. Use message: "Add test plan for segment 04: adapter interface"

- [ ] **Read testing-spec-05-series-crud.md**

  Read the formal specification for series CRUD operations. Understand create, read, update, delete semantics, validation rules, locking behavior, and the split operation. Note the cycling state preservation on split.

- [ ] **Write test-plan-05.md**

  Write a document at `notes/test-plan-05.md` listing each test for series CRUD. Include:
  - Create series tests (valid and invalid inputs)
  - Read/query tests
  - Update tests (including locked series)
  - Delete tests (with/without completions, with/without children)
  - Split operation tests
  - Validation rule tests (fixed + wiggle incompatibility)
  - Error type tests (CompletionsExistError, LinkedChildrenExistError)

  Ensure adherence to testing-spec-05-series-crud.md.

- [ ] **Review test-plan-05.md against spec**

  Re-read testing-spec-05-series-crud.md and compare against test-plan-05.md. Verify every law, invariant, boundary condition, and error case in the spec has a corresponding test in the plan. If gaps exist, update the test plan before proceeding.

- [ ] **Commit test plan for segment 05**

  Stage and commit `notes/test-plan-05.md`. Use message: "Add test plan for segment 05: series CRUD"

- [ ] **Load project notes into context**

  Read all documents in `notes/` except testing-spec documents to understand the project architecture, requirements, and design decisions. **Do this even if you believe you have read these recently.** This is life-critical software; full context is essential. Files to read:
  - `concepts.md` - Core domain concepts
  - `requirements.md` - Functional requirements
  - `architecture-decisions.md` - Key design choices
  - `type-shapes.md` - Type definitions
  - `schema.md` - Database schema
  - `adapter-interface.md` - Storage adapter contract
  - `api-surface.md` - Public API shape
  - `recurrence-patterns.md` - Pattern syntax and semantics
  - `condition-syntax.md` - Condition DSL
  - `reflow-algorithm.md` - Scheduling algorithm overview
  - `testing-plan.md` - Original testing outline

  Exclude testing-spec documents as they are large and will be read individually during later steps.

- [ ] **Read testing-spec-06-completions.md**

  Read the formal specification for completion logging. Understand completion structure, logging rules, query methods, and the relationship between completions and cycling advancement.

- [ ] **Write test-plan-06.md**

  Write a document at `notes/test-plan-06.md` listing each test for completions. Include:
  - Log completion tests
  - Query completion tests (by series, by tag, by window)
  - Delete completion tests
  - Duplicate completion prevention tests
  - Completion-triggered cycling advancement tests

  Ensure adherence to testing-spec-06-completions.md.

- [ ] **Review test-plan-06.md against spec**

  Re-read testing-spec-06-completions.md and compare against test-plan-06.md. Verify every law, invariant, boundary condition, and error case in the spec has a corresponding test in the plan. If gaps exist, update the test plan before proceeding.

- [ ] **Commit test plan for segment 06**

  Stage and commit `notes/test-plan-06.md`. Use message: "Add test plan for segment 06: completions"

- [ ] **Read testing-spec-07-cycling.md**

  Read the formal specification for cycling (rotating titles/descriptions). Understand sequential vs random modes, gapLeap behavior, index advancement, and the critical no-auto-reset rule.

- [ ] **Write test-plan-07.md**

  Write a document at `notes/test-plan-07.md` listing each test for cycling. Include:
  - Sequential mode tests (gapLeap=false)
  - Sequential mode tests (gapLeap=true)
  - Random mode tests
  - Index advancement on completion tests
  - Skip behavior tests (gapLeap=true)
  - No auto-reset on pattern deactivation tests
  - Reset cycling tests
  - Instance number calculation tests

  Ensure adherence to testing-spec-07-cycling.md.

- [ ] **Review test-plan-07.md against spec**

  Re-read testing-spec-07-cycling.md and compare against test-plan-07.md. Verify every law, invariant, boundary condition, and error case in the spec has a corresponding test in the plan. If gaps exist, update the test plan before proceeding. Gaps in test coverage put lives at risk.

- [ ] **Commit test plan for segment 07**

  Stage and commit `notes/test-plan-07.md`. Use message: "Add test plan for segment 07: cycling"

- [ ] **Read testing-spec-08-adaptive-duration.md**

  Read the formal specification for adaptive duration calculation. Understand the lastN mode, multiplier application, fallback behavior, and the floor clamp to 1 minute.

- [ ] **Write test-plan-08.md**

  Write a document at `notes/test-plan-08.md` listing each test for adaptive duration. Include:
  - Fallback tests (no history)
  - lastN calculation tests
  - Multiplier application tests
  - Floor clamp tests (result >= 1)
  - Insufficient history tests
  - Zero-duration completion edge case tests

  Ensure adherence to testing-spec-08-adaptive-duration.md.

- [ ] **Review test-plan-08.md against spec**

  Re-read testing-spec-08-adaptive-duration.md and compare against test-plan-08.md. Verify every law, invariant, boundary condition, and error case in the spec has a corresponding test in the plan. If gaps exist, update the test plan before proceeding.

- [ ] **Commit test plan for segment 08**

  Stage and commit `notes/test-plan-08.md`. Use message: "Add test plan for segment 08: adaptive duration"

- [ ] **Read testing-spec-09-instance-exceptions.md**

  Read the formal specification for instance exceptions (cancel/reschedule). Understand exception types, storage, application during expansion, and the update-vs-create semantics for reschedule.

- [ ] **Write test-plan-09.md**

  Write a document at `notes/test-plan-09.md` listing each test for instance exceptions. Include:
  - Cancel instance tests
  - Reschedule instance tests
  - Reschedule update (existing exception) tests
  - Non-existent instance error tests
  - Already cancelled error tests
  - Cancelled instance reschedule error tests
  - Exception persistence tests

  Ensure adherence to testing-spec-09-instance-exceptions.md.

- [ ] **Review test-plan-09.md against spec**

  Re-read testing-spec-09-instance-exceptions.md and compare against test-plan-09.md. Verify every law, invariant, boundary condition, and error case in the spec has a corresponding test in the plan. If gaps exist, update the test plan before proceeding.

- [ ] **Commit test plan for segment 09**

  Stage and commit `notes/test-plan-09.md`. Use message: "Add test plan for segment 09: instance exceptions"

- [ ] **Read testing-spec-10-reminders.md**

  Read the formal specification for reminders. Understand reminder configuration, fire time calculation, acknowledgment, and the special handling for all-day instances (relative to 00:00).

- [ ] **Write test-plan-10.md**

  Write a document at `notes/test-plan-10.md` listing each test for reminders. Include:
  - Fire time calculation tests (timed instances)
  - Fire time calculation tests (all-day instances)
  - Pending reminder query tests
  - Acknowledgment tests
  - Acknowledgment idempotency tests
  - Cross-day reminder tests (fires previous day)

  Ensure adherence to testing-spec-10-reminders.md.

- [ ] **Review test-plan-10.md against spec**

  Re-read testing-spec-10-reminders.md and compare against test-plan-10.md. Verify every law, invariant, boundary condition, and error case in the spec has a corresponding test in the plan. If gaps exist, update the test plan before proceeding.

- [ ] **Commit test plan for segment 10**

  Stage and commit `notes/test-plan-10.md`. Use message: "Add test plan for segment 10: reminders"

- [ ] **Load project notes into context**

  Read all documents in `notes/` except testing-spec documents to understand the project architecture, requirements, and design decisions. **Do this even if you believe you have read these recently.** This is life-critical software; full context is essential. Files to read:
  - `concepts.md` - Core domain concepts
  - `requirements.md` - Functional requirements
  - `architecture-decisions.md` - Key design choices
  - `type-shapes.md` - Type definitions
  - `schema.md` - Database schema
  - `adapter-interface.md` - Storage adapter contract
  - `api-surface.md` - Public API shape
  - `recurrence-patterns.md` - Pattern syntax and semantics
  - `condition-syntax.md` - Condition DSL
  - `reflow-algorithm.md` - Scheduling algorithm overview
  - `testing-plan.md` - Original testing outline

  Exclude testing-spec documents as they are large and will be read individually during later steps.

- [ ] **Read testing-spec-11-links.md**

  Read the formal specification for series links (parent-child chains). Understand link creation, target distance, wobble bounds, cycle detection, depth limits (32), and recursive child movement on parent reschedule.

- [ ] **Write test-plan-11.md**

  Write a document at `notes/test-plan-11.md` listing each test for links. Include:
  - Link creation tests
  - Unlink tests
  - Cycle detection tests
  - Chain depth limit tests (32 levels)
  - Child scheduling from parent tests
  - Wobble bound tests (early/late)
  - Parent reschedule cascading tests
  - Chain with completed parent tests

  Ensure adherence to testing-spec-11-links.md.

- [ ] **Review test-plan-11.md against spec**

  Re-read testing-spec-11-links.md and compare against test-plan-11.md. Verify every law, invariant, boundary condition, and error case in the spec has a corresponding test in the plan. If gaps exist, update the test plan before proceeding.

- [ ] **Commit test plan for segment 11**

  Stage and commit `notes/test-plan-11.md`. Use message: "Add test plan for segment 11: links"

- [ ] **Read testing-spec-12-relational-constraints.md**

  Read the formal specification for relational constraints. Understand constraint types (mustBeOnSameDay, cantBeOnSameDay, mustBeBefore, etc.), target resolution, satisfaction checking, and violation reporting.

- [ ] **Write test-plan-12.md**

  Write a document at `notes/test-plan-12.md` listing each test for relational constraints. Include:
  - CRUD tests for constraints
  - Target resolution tests (tag vs seriesId)
  - Satisfaction tests for each constraint type
  - Violation detection tests
  - Empty target (no-op) tests
  - Constraint interaction tests

  Ensure adherence to testing-spec-12-relational-constraints.md.

- [ ] **Review test-plan-12.md against spec**

  Re-read testing-spec-12-relational-constraints.md and compare against test-plan-12.md. Verify every law, invariant, boundary condition, and error case in the spec has a corresponding test in the plan. If gaps exist, update the test plan before proceeding.

- [ ] **Commit test plan for segment 12**

  Stage and commit `notes/test-plan-12.md`. Use message: "Add test plan for segment 12: relational constraints"

- [ ] **Read testing-spec-13-reflow-algorithm.md**

  Read the formal specification for the reflow (scheduling) algorithm. Understand the CSP approach, phases (generate instances, build constraint graph, compute domains, propagation, backtracking), conflict handling, and the soundness guarantee.

- [ ] **Write test-plan-13.md**

  Write a document at `notes/test-plan-13.md` listing each test for the reflow algorithm. Include:
  - Instance generation tests
  - Domain computation tests (fixed, flexible, chain children, all-day)
  - Constraint propagation tests
  - Backtracking search tests
  - No-solution fallback tests
  - Conflict reporting tests
  - Fixed-fixed overlap warning tests
  - Workload balancing tests
  - Soundness verification tests (known solutions)

  Ensure adherence to testing-spec-13-reflow-algorithm.md.

- [ ] **Review test-plan-13.md against spec**

  Re-read testing-spec-13-reflow-algorithm.md and compare against test-plan-13.md. Verify every law, invariant, boundary condition, and error case in the spec has a corresponding test in the plan. If gaps exist, update the test plan before proceeding. The reflow algorithm is the core of this life-critical system.

- [ ] **Commit test plan for segment 13**

  Stage and commit `notes/test-plan-13.md`. Use message: "Add test plan for segment 13: reflow algorithm"

- [ ] **Read testing-spec-14-public-api.md**

  Read the formal specification for the public API. Understand initialization, all API methods, timezone conversion at boundaries, reflow triggering, error handling, idempotency rules, and event emission.

- [ ] **Write test-plan-14.md**

  Write a document at `notes/test-plan-14.md` listing each test for the public API. Include:
  - Initialization tests
  - Each API method tests
  - Timezone conversion tests (input/output)
  - Reflow trigger tests
  - Error type tests (all error types)
  - Idempotency tests (lock, unlock, acknowledgeReminder)
  - Event emission tests (reflow, conflict, reminderDue)
  - Transactional rollback tests

  Ensure adherence to testing-spec-14-public-api.md.

- [ ] **Review test-plan-14.md against spec**

  Re-read testing-spec-14-public-api.md and compare against test-plan-14.md. Verify every law, invariant, boundary condition, and error case in the spec has a corresponding test in the plan. If gaps exist, update the test plan before proceeding.

- [ ] **Commit test plan for segment 14**

  Stage and commit `notes/test-plan-14.md`. Use message: "Add test plan for segment 14: public API"

- [ ] **Read testing-spec-15-sqlite-adapter.md**

  Read the formal specification for the SQLite adapter implementation. Understand the schema mapping, query implementations, and SQLite-specific behavior.

- [ ] **Write test-plan-15.md**

  Write a document at `notes/test-plan-15.md` listing each test for the SQLite adapter. Include:
  - Schema creation tests
  - All adapter interface contract tests (from spec 04)
  - SQLite-specific edge cases
  - Migration tests (if applicable)
  - Concurrent access tests

  Ensure adherence to testing-spec-15-sqlite-adapter.md.

- [ ] **Review test-plan-15.md against spec**

  Re-read testing-spec-15-sqlite-adapter.md and compare against test-plan-15.md. Verify every law, invariant, boundary condition, and error case in the spec has a corresponding test in the plan. If gaps exist, update the test plan before proceeding.

- [ ] **Commit test plan for segment 15**

  Stage and commit `notes/test-plan-15.md`. Use message: "Add test plan for segment 15: SQLite adapter"

- [ ] **Read testing-spec-16-integration.md**

  Read the formal specification for integration tests. Understand the end-to-end scenarios: exercise regimen, laundry chain, conflicts, relational constraints, large data, timezone/DST, reminders, instance exceptions, cycling, adaptive duration, leap year, and chain depth.

- [ ] **Write test-plan-16.md**

  Write a document at `notes/test-plan-16.md` listing each integration test scenario. Include:
  - Exercise regimen scenario (state transitions, cycling)
  - Laundry chain scenario (chain updates, cascading)
  - Conflict scenarios (fixed-fixed, impossible constraint, chain cannot fit)
  - Relational constraint scenario
  - Large data scenario (performance)
  - Timezone/DST scenario
  - Reminder scenario
  - Instance exception scenario
  - Cycling scenario (gapLeap behavior)
  - Adaptive duration scenario
  - Leap year scenario (Feb 29)
  - Chain depth scenario (32 levels)
  - E2E property verification

  Ensure adherence to testing-spec-16-integration.md.

- [ ] **Review test-plan-16.md against spec**

  Re-read testing-spec-16-integration.md and compare against test-plan-16.md. Verify every law, invariant, boundary condition, and error case in the spec has a corresponding test in the plan. If gaps exist, update the test plan before proceeding. Integration tests are the final safety net for life-critical software.

- [ ] **Commit test plan for segment 16**

  Stage and commit `notes/test-plan-16.md`. Use message: "Add test plan for segment 16: integration tests"

- [ ] **Load project notes into context**

  Read all documents in `notes/` except testing-spec documents to understand the project architecture, requirements, and design decisions. **Do this even if you believe you have read these recently.** This is life-critical software; full context is essential. Files to read:
  - `concepts.md` - Core domain concepts
  - `requirements.md` - Functional requirements
  - `architecture-decisions.md` - Key design choices
  - `type-shapes.md` - Type definitions
  - `schema.md` - Database schema
  - `adapter-interface.md` - Storage adapter contract
  - `api-surface.md` - Public API shape
  - `recurrence-patterns.md` - Pattern syntax and semantics
  - `condition-syntax.md` - Condition DSL
  - `reflow-algorithm.md` - Scheduling algorithm overview
  - `testing-plan.md` - Original testing outline

  Exclude testing-spec documents as they are large and will be read individually during later steps.

- [ ] **Read test-plan-01.md**

  Read the test plan you wrote earlier for segment 01. **Do this even if you believe you remember it.** Note the specific tests listed, their expected inputs/outputs, and the total count of tests specified.

- [ ] **Write tests for test-plan-01.md**

  Implement all tests specified in test-plan-01.md. Create the test file at `tests/01-time-date.test.ts`. This is life-critical software—every test must be real and meaningful. Each test should:
  - Have a clear, descriptive name
  - Reference the law/invariant being verified in a comment
  - Use appropriate assertions
  - Cover the exact inputs/outputs from the plan

- [ ] **Verify test count for segment 01**

  Count the tests you just wrote. Compare against the count specified in test-plan-01.md. These numbers must match exactly. If they do not match, identify which tests are missing and write them before proceeding. Every planned test matters for life-critical software.

- [ ] **Verify tests fail for segment 01**

  Run the tests for segment 01 and verify they fail due to non-implementation (red phase). Confirm:
  - Tests that check for not-yet-implemented functions fail with appropriate errors
  - No tests pass accidentally due to test bugs
  - Tests that should pass with stub/mock implementations do pass
  - Failure messages are clear and actionable

  If any tests pass unexpectedly, fix them before proceeding. Do not mark this task complete until all tests fail appropriately.

- [ ] **Commit tests for segment 01**

  Stage and commit `tests/01-time-date.test.ts`. Use message: "Add tests for segment 01: time and date"

- [ ] **Read test-plan-02.md**

  Read the test plan you wrote earlier for segment 02. **Do this even if you believe you remember it.** Note the specific tests listed and the total count.

- [ ] **Write tests for test-plan-02.md**

  Implement all tests specified in test-plan-02.md at `tests/02-pattern-expansion.test.ts`. Follow the same standards as segment 01. No shortcuts—lives depend on this.

- [ ] **Verify test count for segment 02**

  Count the tests you just wrote. Compare against the count specified in test-plan-02.md. These numbers must match exactly.

- [ ] **Verify tests fail for segment 02**

  Run segment 02 tests and verify appropriate failures. If any tests pass unexpectedly, fix them before proceeding. Do not mark this task complete until all tests fail appropriately.

- [ ] **Commit tests for segment 02**

  Stage and commit `tests/02-pattern-expansion.test.ts`. Use message: "Add tests for segment 02: pattern expansion"

- [ ] **Read test-plan-03.md**

  Read the test plan you wrote earlier for segment 03. **Do this even if you believe you remember it.** Note the specific tests listed and the total count.

- [ ] **Write tests for test-plan-03.md**

  Implement all tests specified in test-plan-03.md at `tests/03-condition-evaluation.test.ts`. Every edge case matters for life-critical software.

- [ ] **Verify test count for segment 03**

  Count the tests you just wrote. Compare against the count specified in test-plan-03.md. These numbers must match exactly.

- [ ] **Verify tests fail for segment 03**

  Run segment 03 tests and verify appropriate failures. If any tests pass unexpectedly, fix them before proceeding. Do not mark this task complete until all tests fail appropriately.

- [ ] **Commit tests for segment 03**

  Stage and commit `tests/03-condition-evaluation.test.ts`. Use message: "Add tests for segment 03: condition evaluation"

- [ ] **Read test-plan-04.md**

  Read the test plan you wrote earlier for segment 04. **Do this even if you believe you remember it.** Note the specific tests listed and the total count.

- [ ] **Write tests for test-plan-04.md**

  Implement all tests specified in test-plan-04.md at `tests/04-adapter.test.ts`. These should be contract tests runnable against any adapter implementation. The data layer must be bulletproof.

- [ ] **Verify test count for segment 04**

  Count the tests you just wrote. Compare against the count specified in test-plan-04.md. These numbers must match exactly.

- [ ] **Verify tests fail for segment 04**

  Run segment 04 tests and verify appropriate failures. If any tests pass unexpectedly, fix them before proceeding. Do not mark this task complete until all tests fail appropriately.

- [ ] **Commit tests for segment 04**

  Stage and commit `tests/04-adapter.test.ts`. Use message: "Add tests for segment 04: adapter interface"

- [ ] **Read test-plan-05.md**

  Read the test plan you wrote earlier for segment 05. **Do this even if you believe you remember it.** Note the specific tests listed and the total count.

- [ ] **Write tests for test-plan-05.md**

  Implement all tests specified in test-plan-05.md at `tests/05-series-crud.test.ts`. Lives depend on data integrity.

- [ ] **Verify test count for segment 05**

  Count the tests you just wrote. Compare against the count specified in test-plan-05.md. These numbers must match exactly.

- [ ] **Verify tests fail for segment 05**

  Run segment 05 tests and verify appropriate failures. If any tests pass unexpectedly, fix them before proceeding. Do not mark this task complete until all tests fail appropriately.

- [ ] **Commit tests for segment 05**

  Stage and commit `tests/05-series-crud.test.ts`. Use message: "Add tests for segment 05: series CRUD"

- [ ] **Read test-plan-06.md**

  Read the test plan you wrote earlier for segment 06. **Do this even if you believe you remember it.** Note the specific tests listed and the total count.

- [ ] **Write tests for test-plan-06.md**

  Implement all tests specified in test-plan-06.md at `tests/06-completions.test.ts`. This is life-critical software.

- [ ] **Verify test count for segment 06**

  Count the tests you just wrote. Compare against the count specified in test-plan-06.md. These numbers must match exactly.

- [ ] **Verify tests fail for segment 06**

  Run segment 06 tests and verify appropriate failures. If any tests pass unexpectedly, fix them before proceeding. Do not mark this task complete until all tests fail appropriately.

- [ ] **Commit tests for segment 06**

  Stage and commit `tests/06-completions.test.ts`. Use message: "Add tests for segment 06: completions"

- [ ] **Read test-plan-07.md**

  Read the test plan you wrote earlier for segment 07. **Do this even if you believe you remember it.** Note the specific tests listed and the total count.

- [ ] **Write tests for test-plan-07.md**

  Implement all tests specified in test-plan-07.md at `tests/07-cycling.test.ts`. No fake tests—people will rely on this working correctly.

- [ ] **Verify test count for segment 07**

  Count the tests you just wrote. Compare against the count specified in test-plan-07.md. These numbers must match exactly.

- [ ] **Verify tests fail for segment 07**

  Run segment 07 tests and verify appropriate failures. If any tests pass unexpectedly, fix them before proceeding. Do not mark this task complete until all tests fail appropriately.

- [ ] **Commit tests for segment 07**

  Stage and commit `tests/07-cycling.test.ts`. Use message: "Add tests for segment 07: cycling"

- [ ] **Read test-plan-08.md**

  Read the test plan you wrote earlier for segment 08. **Do this even if you believe you remember it.** Note the specific tests listed and the total count.

- [ ] **Write tests for test-plan-08.md**

  Implement all tests specified in test-plan-08.md at `tests/08-adaptive-duration.test.ts`. Every assertion must be meaningful.

- [ ] **Verify test count for segment 08**

  Count the tests you just wrote. Compare against the count specified in test-plan-08.md. These numbers must match exactly.

- [ ] **Verify tests fail for segment 08**

  Run segment 08 tests and verify appropriate failures. If any tests pass unexpectedly, fix them before proceeding. Do not mark this task complete until all tests fail appropriately.

- [ ] **Commit tests for segment 08**

  Stage and commit `tests/08-adaptive-duration.test.ts`. Use message: "Add tests for segment 08: adaptive duration"

- [ ] **Read test-plan-09.md**

  Read the test plan you wrote earlier for segment 09. **Do this even if you believe you remember it.** Note the specific tests listed and the total count.

- [ ] **Write tests for test-plan-09.md**

  Implement all tests specified in test-plan-09.md at `tests/09-instance-exceptions.test.ts`. Life-critical software demands thorough exception handling tests.

- [ ] **Verify test count for segment 09**

  Count the tests you just wrote. Compare against the count specified in test-plan-09.md. These numbers must match exactly.

- [ ] **Verify tests fail for segment 09**

  Run segment 09 tests and verify appropriate failures. If any tests pass unexpectedly, fix them before proceeding. Do not mark this task complete until all tests fail appropriately.

- [ ] **Commit tests for segment 09**

  Stage and commit `tests/09-instance-exceptions.test.ts`. Use message: "Add tests for segment 09: instance exceptions"

- [ ] **Read test-plan-10.md**

  Read the test plan you wrote earlier for segment 10. **Do this even if you believe you remember it.** Note the specific tests listed and the total count.

- [ ] **Write tests for test-plan-10.md**

  Implement all tests specified in test-plan-10.md at `tests/10-reminders.test.ts`. Reminders failing silently could have serious consequences.

- [ ] **Verify test count for segment 10**

  Count the tests you just wrote. Compare against the count specified in test-plan-10.md. These numbers must match exactly.

- [ ] **Verify tests fail for segment 10**

  Run segment 10 tests and verify appropriate failures. If any tests pass unexpectedly, fix them before proceeding. Do not mark this task complete until all tests fail appropriately.

- [ ] **Commit tests for segment 10**

  Stage and commit `tests/10-reminders.test.ts`. Use message: "Add tests for segment 10: reminders"

- [ ] **Read test-plan-11.md**

  Read the test plan you wrote earlier for segment 11. **Do this even if you believe you remember it.** Note the specific tests listed and the total count.

- [ ] **Write tests for test-plan-11.md**

  Implement all tests specified in test-plan-11.md at `tests/11-links.test.ts`. Chain integrity is critical—lives depend on correct scheduling.

- [ ] **Verify test count for segment 11**

  Count the tests you just wrote. Compare against the count specified in test-plan-11.md. These numbers must match exactly.

- [ ] **Verify tests fail for segment 11**

  Run segment 11 tests and verify appropriate failures. If any tests pass unexpectedly, fix them before proceeding. Do not mark this task complete until all tests fail appropriately.

- [ ] **Commit tests for segment 11**

  Stage and commit `tests/11-links.test.ts`. Use message: "Add tests for segment 11: links"

- [ ] **Read test-plan-12.md**

  Read the test plan you wrote earlier for segment 12. **Do this even if you believe you remember it.** Note the specific tests listed and the total count.

- [ ] **Write tests for test-plan-12.md**

  Implement all tests specified in test-plan-12.md at `tests/12-relational-constraints.test.ts`. Constraint violations in life-critical software are unacceptable.

- [ ] **Verify test count for segment 12**

  Count the tests you just wrote. Compare against the count specified in test-plan-12.md. These numbers must match exactly.

- [ ] **Verify tests fail for segment 12**

  Run segment 12 tests and verify appropriate failures. If any tests pass unexpectedly, fix them before proceeding. Do not mark this task complete until all tests fail appropriately.

- [ ] **Commit tests for segment 12**

  Stage and commit `tests/12-relational-constraints.test.ts`. Use message: "Add tests for segment 12: relational constraints"

- [ ] **Read test-plan-13.md**

  Read the test plan you wrote earlier for segment 13. **Do this even if you believe you remember it.** Note the specific tests listed and the total count. This is the most complex segment.

- [ ] **Write tests for test-plan-13.md**

  Implement all tests specified in test-plan-13.md at `tests/13-reflow-algorithm.test.ts`. This is the most complex segment; ensure thorough coverage of the CSP algorithm. The scheduling core must be rock solid—lives depend on it.

- [ ] **Verify test count for segment 13**

  Count the tests you just wrote. Compare against the count specified in test-plan-13.md. These numbers must match exactly.

- [ ] **Verify tests fail for segment 13**

  Run segment 13 tests and verify appropriate failures. If any tests pass unexpectedly, fix them before proceeding. Do not mark this task complete until all tests fail appropriately.

- [ ] **Commit tests for segment 13**

  Stage and commit `tests/13-reflow-algorithm.test.ts`. Use message: "Add tests for segment 13: reflow algorithm"

- [ ] **Read test-plan-14.md**

  Read the test plan you wrote earlier for segment 14. **Do this even if you believe you remember it.** Note the specific tests listed and the total count.

- [ ] **Write tests for test-plan-14.md**

  Implement all tests specified in test-plan-14.md at `tests/14-public-api.test.ts`. The API is the contract with consumers of this life-critical system.

- [ ] **Verify test count for segment 14**

  Count the tests you just wrote. Compare against the count specified in test-plan-14.md. These numbers must match exactly.

- [ ] **Verify tests fail for segment 14**

  Run segment 14 tests and verify appropriate failures. If any tests pass unexpectedly, fix them before proceeding. Do not mark this task complete until all tests fail appropriately.

- [ ] **Commit tests for segment 14**

  Stage and commit `tests/14-public-api.test.ts`. Use message: "Add tests for segment 14: public API"

- [ ] **Read test-plan-15.md**

  Read the test plan you wrote earlier for segment 15. **Do this even if you believe you remember it.** Note the specific tests listed and the total count.

- [ ] **Write tests for test-plan-15.md**

  Implement all tests specified in test-plan-15.md at `tests/15-sqlite-adapter.test.ts`. Data persistence errors in life-critical software are catastrophic.

- [ ] **Verify test count for segment 15**

  Count the tests you just wrote. Compare against the count specified in test-plan-15.md. These numbers must match exactly.

- [ ] **Verify tests fail for segment 15**

  Run segment 15 tests and verify appropriate failures. If any tests pass unexpectedly, fix them before proceeding. Do not mark this task complete until all tests fail appropriately.

- [ ] **Commit tests for segment 15**

  Stage and commit `tests/15-sqlite-adapter.test.ts`. Use message: "Add tests for segment 15: SQLite adapter"

- [ ] **Read test-plan-16.md**

  Read the test plan you wrote earlier for segment 16. **Do this even if you believe you remember it.** Note the specific tests listed and the total count.

- [ ] **Write tests for test-plan-16.md**

  Implement all integration tests specified in test-plan-16.md at `tests/16-integration.test.ts`. These are end-to-end scenarios that exercise multiple components together. Integration failures in life-critical software can cascade—test thoroughly.

- [ ] **Verify test count for segment 16**

  Count the tests you just wrote. Compare against the count specified in test-plan-16.md. These numbers must match exactly.

- [ ] **Verify tests fail for segment 16**

  Run segment 16 tests and verify appropriate failures. If any tests pass unexpectedly, fix them before proceeding. Do not mark this task complete until all tests fail appropriately.

- [ ] **Commit tests for segment 16**

  Stage and commit `tests/16-integration.test.ts`. Use message: "Add tests for segment 16: integration tests"

- [ ] **Load project notes into context**

  Read all documents in `notes/` except testing-spec documents to understand the project architecture, requirements, and design decisions. **Do this even if you believe you have read these recently.** This is life-critical software; full context is essential. Files to read:
  - `concepts.md` - Core domain concepts
  - `requirements.md` - Functional requirements
  - `architecture-decisions.md` - Key design choices
  - `type-shapes.md` - Type definitions
  - `schema.md` - Database schema
  - `adapter-interface.md` - Storage adapter contract
  - `api-surface.md` - Public API shape
  - `recurrence-patterns.md` - Pattern syntax and semantics
  - `condition-syntax.md` - Condition DSL
  - `reflow-algorithm.md` - Scheduling algorithm overview
  - `testing-plan.md` - Original testing outline

  Exclude testing-spec documents as they are large and will be read individually during later steps.

- [ ] **Read testing-spec-01-time-date.md**

  Re-read the formal specification for segment 01. **Do this even if you believe you remember it.** You will be reviewing tests against this spec.

- [ ] **Read the test files for segment 01**

  Read the actual test files you wrote for segment 01. **Do this even if you believe you remember what you wrote.** You need to see the actual code, not your memory of it.

- [ ] **Review tests for test-plan-01.md**

  Review the implemented tests against test-plan-01.md and testing-spec-01-time-date.md. Verify:
  - All planned tests are implemented (no skipped tests)
  - Each test actually runs and produces a meaningful pass/fail result
  - Assertions test the right thing (not tautologies, not no-ops)
  - Tests would fail if the implementation were wrong (try mentally breaking the code)
  - Edge cases and boundary conditions are genuinely covered, not just mentioned
  - Test logic is sound and the expected values are correct
  - Tests are independent and don't rely on execution order
  - No false confidence: tests that pass for the wrong reasons

  **Document your findings.** Write your findings to `notes/review-findings-01.md`. State either "No issues found" or list each issue discovered. This file is required before marking this task complete. For life-critical software, honest assessment is non-negotiable.

- [ ] **Commit review findings for segment 01**

  Stage and commit `notes/review-findings-01.md`. Use message: "Add review findings for segment 01: time and date"

- [ ] **Read testing-spec-02-pattern-expansion.md**

  Re-read the formal specification for segment 02. **Do this even if you believe you remember it.** You will be reviewing tests against this spec.

- [ ] **Read the test files for segment 02**

  Read the actual test files you wrote for segment 02. **Do this even if you believe you remember what you wrote.** You need to see the actual code, not your memory of it.

- [ ] **Review tests for test-plan-02.md**

  Review the implemented tests against test-plan-02.md and testing-spec-02-pattern-expansion.md. Verify:
  - All planned tests are implemented (no skipped tests)
  - Each test actually runs and produces a meaningful pass/fail result
  - Assertions test the right thing (not tautologies, not no-ops)
  - Tests would fail if the implementation were wrong (try mentally breaking the code)
  - Edge cases and boundary conditions are genuinely covered, not just mentioned
  - Test logic is sound and the expected values are correct
  - Tests are independent and don't rely on execution order
  - No false confidence: tests that pass for the wrong reasons

  **Document your findings.** Write your findings to `notes/review-findings-02.md`. State either "No issues found" or list each issue discovered. This file is required before marking this task complete.

- [ ] **Commit review findings for segment 02**

  Stage and commit `notes/review-findings-02.md`. Use message: "Add review findings for segment 02: pattern expansion"

- [ ] **Read testing-spec-03-condition-evaluation.md**

  Re-read the formal specification for segment 03. **Do this even if you believe you remember it.** You will be reviewing tests against this spec.

- [ ] **Read the test files for segment 03**

  Read the actual test files you wrote for segment 03. **Do this even if you believe you remember what you wrote.** You need to see the actual code, not your memory of it.

- [ ] **Review tests for test-plan-03.md**

  Review the implemented tests against test-plan-03.md and testing-spec-03-condition-evaluation.md. Verify:
  - All planned tests are implemented (no skipped tests)
  - Each test actually runs and produces a meaningful pass/fail result
  - Assertions test the right thing (not tautologies, not no-ops)
  - Tests would fail if the implementation were wrong (try mentally breaking the code)
  - Edge cases and boundary conditions are genuinely covered, not just mentioned
  - Test logic is sound and the expected values are correct
  - Tests are independent and don't rely on execution order
  - No false confidence: tests that pass for the wrong reasons

  **Document your findings.** Write your findings to `notes/review-findings-03.md`. State either "No issues found" or list each issue discovered. This file is required before marking this task complete.

- [ ] **Commit review findings for segment 03**

  Stage and commit `notes/review-findings-03.md`. Use message: "Add review findings for segment 03: condition evaluation"

- [ ] **Read testing-spec-04-adapter.md**

  Re-read the formal specification for segment 04. **Do this even if you believe you remember it.** You will be reviewing tests against this spec.

- [ ] **Read the test files for segment 04**

  Read the actual test files you wrote for segment 04. **Do this even if you believe you remember what you wrote.** You need to see the actual code, not your memory of it.

- [ ] **Review tests for test-plan-04.md**

  Review the implemented tests against test-plan-04.md and testing-spec-04-adapter.md. Verify:
  - All planned tests are implemented (no skipped tests)
  - Each test actually runs and produces a meaningful pass/fail result
  - Assertions test the right thing (not tautologies, not no-ops)
  - Tests would fail if the implementation were wrong (try mentally breaking the code)
  - Edge cases and boundary conditions are genuinely covered, not just mentioned
  - Test logic is sound and the expected values are correct
  - Tests are independent and don't rely on execution order
  - No false confidence: tests that pass for the wrong reasons

  **Document your findings.** Write your findings to `notes/review-findings-04.md`. State either "No issues found" or list each issue discovered. This file is required before marking this task complete.

- [ ] **Commit review findings for segment 04**

  Stage and commit `notes/review-findings-04.md`. Use message: "Add review findings for segment 04: adapter interface"

- [ ] **Read testing-spec-05-series-crud.md**

  Re-read the formal specification for segment 05. **Do this even if you believe you remember it.** You will be reviewing tests against this spec.

- [ ] **Read the test files for segment 05**

  Read the actual test files you wrote for segment 05. **Do this even if you believe you remember what you wrote.** You need to see the actual code, not your memory of it.

- [ ] **Review tests for test-plan-05.md**

  Review the implemented tests against test-plan-05.md and testing-spec-05-series-crud.md. Verify:
  - All planned tests are implemented (no skipped tests)
  - Each test actually runs and produces a meaningful pass/fail result
  - Assertions test the right thing (not tautologies, not no-ops)
  - Tests would fail if the implementation were wrong (try mentally breaking the code)
  - Edge cases and boundary conditions are genuinely covered, not just mentioned
  - Test logic is sound and the expected values are correct
  - Tests are independent and don't rely on execution order
  - No false confidence: tests that pass for the wrong reasons

  **Document your findings.** Write your findings to `notes/review-findings-05.md`. State either "No issues found" or list each issue discovered. This file is required before marking this task complete. Cutting corners on reviews puts lives at risk.

- [ ] **Commit review findings for segment 05**

  Stage and commit `notes/review-findings-05.md`. Use message: "Add review findings for segment 05: series CRUD"

- [ ] **Load project notes into context**

  Read all documents in `notes/` except testing-spec documents to understand the project architecture, requirements, and design decisions. **Do this even if you believe you have read these recently.** This is life-critical software; full context is essential. Files to read:
  - `concepts.md` - Core domain concepts
  - `requirements.md` - Functional requirements
  - `architecture-decisions.md` - Key design choices
  - `type-shapes.md` - Type definitions
  - `schema.md` - Database schema
  - `adapter-interface.md` - Storage adapter contract
  - `api-surface.md` - Public API shape
  - `recurrence-patterns.md` - Pattern syntax and semantics
  - `condition-syntax.md` - Condition DSL
  - `reflow-algorithm.md` - Scheduling algorithm overview
  - `testing-plan.md` - Original testing outline

  Exclude testing-spec documents as they are large and will be read individually during later steps.

- [ ] **Read testing-spec-06-completions.md**

  Re-read the formal specification for segment 06. **Do this even if you believe you remember it.** You will be reviewing tests against this spec.

- [ ] **Read the test files for segment 06**

  Read the actual test files you wrote for segment 06. **Do this even if you believe you remember what you wrote.** You need to see the actual code, not your memory of it.

- [ ] **Review tests for test-plan-06.md**

  Review the implemented tests against test-plan-06.md and testing-spec-06-completions.md. Verify:
  - All planned tests are implemented (no skipped tests)
  - Each test actually runs and produces a meaningful pass/fail result
  - Assertions test the right thing (not tautologies, not no-ops)
  - Tests would fail if the implementation were wrong (try mentally breaking the code)
  - Edge cases and boundary conditions are genuinely covered, not just mentioned
  - Test logic is sound and the expected values are correct
  - Tests are independent and don't rely on execution order
  - No false confidence: tests that pass for the wrong reasons

  **Document your findings.** Write your findings to `notes/review-findings-06.md`. State either "No issues found" or list each issue discovered. This file is required before marking this task complete.

- [ ] **Commit review findings for segment 06**

  Stage and commit `notes/review-findings-06.md`. Use message: "Add review findings for segment 06: completions"

- [ ] **Read testing-spec-07-cycling.md**

  Re-read the formal specification for segment 07. **Do this even if you believe you remember it.** You will be reviewing tests against this spec.

- [ ] **Read the test files for segment 07**

  Read the actual test files you wrote for segment 07. **Do this even if you believe you remember what you wrote.** You need to see the actual code, not your memory of it.

- [ ] **Review tests for test-plan-07.md**

  Review the implemented tests against test-plan-07.md and testing-spec-07-cycling.md. Verify:
  - All planned tests are implemented (no skipped tests)
  - Each test actually runs and produces a meaningful pass/fail result
  - Assertions test the right thing (not tautologies, not no-ops)
  - Tests would fail if the implementation were wrong (try mentally breaking the code)
  - Edge cases and boundary conditions are genuinely covered, not just mentioned
  - Test logic is sound and the expected values are correct
  - Tests are independent and don't rely on execution order
  - No false confidence: tests that pass for the wrong reasons

  **Document your findings.** Write your findings to `notes/review-findings-07.md`. State either "No issues found" or list each issue discovered. This file is required before marking this task complete.

- [ ] **Commit review findings for segment 07**

  Stage and commit `notes/review-findings-07.md`. Use message: "Add review findings for segment 07: cycling"

- [ ] **Read testing-spec-08-adaptive-duration.md**

  Re-read the formal specification for segment 08. **Do this even if you believe you remember it.** You will be reviewing tests against this spec.

- [ ] **Read the test files for segment 08**

  Read the actual test files you wrote for segment 08. **Do this even if you believe you remember what you wrote.** You need to see the actual code, not your memory of it.

- [ ] **Review tests for test-plan-08.md**

  Review the implemented tests against test-plan-08.md and testing-spec-08-adaptive-duration.md. Verify:
  - All planned tests are implemented (no skipped tests)
  - Each test actually runs and produces a meaningful pass/fail result
  - Assertions test the right thing (not tautologies, not no-ops)
  - Tests would fail if the implementation were wrong (try mentally breaking the code)
  - Edge cases and boundary conditions are genuinely covered, not just mentioned
  - Test logic is sound and the expected values are correct
  - Tests are independent and don't rely on execution order
  - No false confidence: tests that pass for the wrong reasons

  **Document your findings.** Write your findings to `notes/review-findings-08.md`. State either "No issues found" or list each issue discovered. This file is required before marking this task complete.

- [ ] **Commit review findings for segment 08**

  Stage and commit `notes/review-findings-08.md`. Use message: "Add review findings for segment 08: adaptive duration"

- [ ] **Read testing-spec-09-instance-exceptions.md**

  Re-read the formal specification for segment 09. **Do this even if you believe you remember it.** You will be reviewing tests against this spec.

- [ ] **Read the test files for segment 09**

  Read the actual test files you wrote for segment 09. **Do this even if you believe you remember what you wrote.** You need to see the actual code, not your memory of it.

- [ ] **Review tests for test-plan-09.md**

  Review the implemented tests against test-plan-09.md and testing-spec-09-instance-exceptions.md. Verify:
  - All planned tests are implemented (no skipped tests)
  - Each test actually runs and produces a meaningful pass/fail result
  - Assertions test the right thing (not tautologies, not no-ops)
  - Tests would fail if the implementation were wrong (try mentally breaking the code)
  - Edge cases and boundary conditions are genuinely covered, not just mentioned
  - Test logic is sound and the expected values are correct
  - Tests are independent and don't rely on execution order
  - No false confidence: tests that pass for the wrong reasons

  **Document your findings.** Write your findings to `notes/review-findings-09.md`. State either "No issues found" or list each issue discovered. This file is required before marking this task complete.

- [ ] **Commit review findings for segment 09**

  Stage and commit `notes/review-findings-09.md`. Use message: "Add review findings for segment 09: instance exceptions"

- [ ] **Read testing-spec-10-reminders.md**

  Re-read the formal specification for segment 10. **Do this even if you believe you remember it.** You will be reviewing tests against this spec.

- [ ] **Read the test files for segment 10**

  Read the actual test files you wrote for segment 10. **Do this even if you believe you remember what you wrote.** You need to see the actual code, not your memory of it.

- [ ] **Review tests for test-plan-10.md**

  Review the implemented tests against test-plan-10.md and testing-spec-10-reminders.md. Verify:
  - All planned tests are implemented (no skipped tests)
  - Each test actually runs and produces a meaningful pass/fail result
  - Assertions test the right thing (not tautologies, not no-ops)
  - Tests would fail if the implementation were wrong (try mentally breaking the code)
  - Edge cases and boundary conditions are genuinely covered, not just mentioned
  - Test logic is sound and the expected values are correct
  - Tests are independent and don't rely on execution order
  - No false confidence: tests that pass for the wrong reasons

  **Document your findings.** Write your findings to `notes/review-findings-10.md`. State either "No issues found" or list each issue discovered. This file is required before marking this task complete. Lives depend on these tests being correct.

- [ ] **Commit review findings for segment 10**

  Stage and commit `notes/review-findings-10.md`. Use message: "Add review findings for segment 10: reminders"

- [ ] **Load project notes into context**

  Read all documents in `notes/` except testing-spec documents to understand the project architecture, requirements, and design decisions. **Do this even if you believe you have read these recently.** This is life-critical software; full context is essential. Files to read:
  - `concepts.md` - Core domain concepts
  - `requirements.md` - Functional requirements
  - `architecture-decisions.md` - Key design choices
  - `type-shapes.md` - Type definitions
  - `schema.md` - Database schema
  - `adapter-interface.md` - Storage adapter contract
  - `api-surface.md` - Public API shape
  - `recurrence-patterns.md` - Pattern syntax and semantics
  - `condition-syntax.md` - Condition DSL
  - `reflow-algorithm.md` - Scheduling algorithm overview
  - `testing-plan.md` - Original testing outline

  Exclude testing-spec documents as they are large and will be read individually during later steps.

- [ ] **Read testing-spec-11-links.md**

  Re-read the formal specification for segment 11. **Do this even if you believe you remember it.** You will be reviewing tests against this spec.

- [ ] **Read the test files for segment 11**

  Read the actual test files you wrote for segment 11. **Do this even if you believe you remember what you wrote.** You need to see the actual code, not your memory of it.

- [ ] **Review tests for test-plan-11.md**

  Review the implemented tests against test-plan-11.md and testing-spec-11-links.md. Verify:
  - All planned tests are implemented (no skipped tests)
  - Each test actually runs and produces a meaningful pass/fail result
  - Assertions test the right thing (not tautologies, not no-ops)
  - Tests would fail if the implementation were wrong (try mentally breaking the code)
  - Edge cases and boundary conditions are genuinely covered, not just mentioned
  - Test logic is sound and the expected values are correct
  - Tests are independent and don't rely on execution order
  - No false confidence: tests that pass for the wrong reasons

  **Document your findings.** Write your findings to `notes/review-findings-11.md`. State either "No issues found" or list each issue discovered. This file is required before marking this task complete.

- [ ] **Commit review findings for segment 11**

  Stage and commit `notes/review-findings-11.md`. Use message: "Add review findings for segment 11: links"

- [ ] **Read testing-spec-12-relational-constraints.md**

  Re-read the formal specification for segment 12. **Do this even if you believe you remember it.** You will be reviewing tests against this spec.

- [ ] **Read the test files for segment 12**

  Read the actual test files you wrote for segment 12. **Do this even if you believe you remember what you wrote.** You need to see the actual code, not your memory of it.

- [ ] **Review tests for test-plan-12.md**

  Review the implemented tests against test-plan-12.md and testing-spec-12-relational-constraints.md. Verify:
  - All planned tests are implemented (no skipped tests)
  - Each test actually runs and produces a meaningful pass/fail result
  - Assertions test the right thing (not tautologies, not no-ops)
  - Tests would fail if the implementation were wrong (try mentally breaking the code)
  - Edge cases and boundary conditions are genuinely covered, not just mentioned
  - Test logic is sound and the expected values are correct
  - Tests are independent and don't rely on execution order
  - No false confidence: tests that pass for the wrong reasons

  **Document your findings.** Write your findings to `notes/review-findings-12.md`. State either "No issues found" or list each issue discovered. This file is required before marking this task complete.

- [ ] **Commit review findings for segment 12**

  Stage and commit `notes/review-findings-12.md`. Use message: "Add review findings for segment 12: relational constraints"

- [ ] **Read testing-spec-13-reflow-algorithm.md**

  Re-read the formal specification for segment 13. **Do this even if you believe you remember it.** You will be reviewing tests against this spec.

- [ ] **Read the test files for segment 13**

  Read the actual test files you wrote for segment 13. **Do this even if you believe you remember what you wrote.** You need to see the actual code, not your memory of it.

- [ ] **Review tests for test-plan-13.md**

  Review the implemented tests against test-plan-13.md and testing-spec-13-reflow-algorithm.md. Verify:
  - All planned tests are implemented (no skipped tests)
  - Each test actually runs and produces a meaningful pass/fail result
  - Assertions test the right thing (not tautologies, not no-ops)
  - Tests would fail if the implementation were wrong (try mentally breaking the code)
  - Edge cases and boundary conditions are genuinely covered, not just mentioned
  - Test logic is sound and the expected values are correct
  - Tests are independent and don't rely on execution order
  - No false confidence: tests that pass for the wrong reasons
  - Soundness tests actually verify the algorithm finds valid solutions when they exist

  **Document your findings.** Write your findings to `notes/review-findings-13.md`. State either "No issues found" or list each issue discovered. This file is required before marking this task complete. The reflow algorithm is the heart of this life-critical system.

- [ ] **Commit review findings for segment 13**

  Stage and commit `notes/review-findings-13.md`. Use message: "Add review findings for segment 13: reflow algorithm"

- [ ] **Read testing-spec-14-public-api.md**

  Re-read the formal specification for segment 14. **Do this even if you believe you remember it.** You will be reviewing tests against this spec.

- [ ] **Read the test files for segment 14**

  Read the actual test files you wrote for segment 14. **Do this even if you believe you remember what you wrote.** You need to see the actual code, not your memory of it.

- [ ] **Review tests for test-plan-14.md**

  Review the implemented tests against test-plan-14.md and testing-spec-14-public-api.md. Verify:
  - All planned tests are implemented (no skipped tests)
  - Each test actually runs and produces a meaningful pass/fail result
  - Assertions test the right thing (not tautologies, not no-ops)
  - Tests would fail if the implementation were wrong (try mentally breaking the code)
  - Edge cases and boundary conditions are genuinely covered, not just mentioned
  - Test logic is sound and the expected values are correct
  - Tests are independent and don't rely on execution order
  - No false confidence: tests that pass for the wrong reasons

  **Document your findings.** Write your findings to `notes/review-findings-14.md`. State either "No issues found" or list each issue discovered. This file is required before marking this task complete.

- [ ] **Commit review findings for segment 14**

  Stage and commit `notes/review-findings-14.md`. Use message: "Add review findings for segment 14: public API"

- [ ] **Read testing-spec-15-sqlite-adapter.md**

  Re-read the formal specification for segment 15. **Do this even if you believe you remember it.** You will be reviewing tests against this spec.

- [ ] **Read the test files for segment 15**

  Read the actual test files you wrote for segment 15. **Do this even if you believe you remember what you wrote.** You need to see the actual code, not your memory of it.

- [ ] **Review tests for test-plan-15.md**

  Review the implemented tests against test-plan-15.md and testing-spec-15-sqlite-adapter.md. Verify:
  - All planned tests are implemented (no skipped tests)
  - Each test actually runs and produces a meaningful pass/fail result
  - Assertions test the right thing (not tautologies, not no-ops)
  - Tests would fail if the implementation were wrong (try mentally breaking the code)
  - Edge cases and boundary conditions are genuinely covered, not just mentioned
  - Test logic is sound and the expected values are correct
  - Tests are independent and don't rely on execution order
  - No false confidence: tests that pass for the wrong reasons

  **Document your findings.** Write your findings to `notes/review-findings-15.md`. State either "No issues found" or list each issue discovered. This file is required before marking this task complete.

- [ ] **Commit review findings for segment 15**

  Stage and commit `notes/review-findings-15.md`. Use message: "Add review findings for segment 15: SQLite adapter"

- [ ] **Read testing-spec-16-integration.md**

  Re-read the formal specification for segment 16. **Do this even if you believe you remember it.** You will be reviewing tests against this spec.

- [ ] **Read the test files for segment 16**

  Read the actual test files you wrote for segment 16. **Do this even if you believe you remember what you wrote.** You need to see the actual code, not your memory of it.

- [ ] **Review tests for test-plan-16.md**

  Review the implemented tests against test-plan-16.md and testing-spec-16-integration.md. Verify:
  - All planned tests are implemented (no skipped tests)
  - Each test actually runs and produces a meaningful pass/fail result
  - Assertions test the right thing (not tautologies, not no-ops)
  - Tests would fail if the implementation were wrong (try mentally breaking the code)
  - Edge cases and boundary conditions are genuinely covered, not just mentioned
  - Test logic is sound and the expected values are correct
  - Tests are independent and don't rely on execution order
  - No false confidence: tests that pass for the wrong reasons
  - E2E scenarios genuinely exercise multi-component interactions

  **Document your findings.** Write your findings to `notes/review-findings-16.md`. State either "No issues found" or list each issue discovered. This file is required before marking this task complete. Integration tests are the last line of defense for life-critical software.

- [ ] **Commit review findings for segment 16**

  Stage and commit `notes/review-findings-16.md`. Use message: "Add review findings for segment 16: integration tests"

- [ ] **Read TEST-AUDIT.md**

  Read `TEST-AUDIT.md` into context. **Do this even if you believe you have read it recently.** Anti-patterns in life-critical test suites are dangerous.

- [ ] **Read the test files for segment 01**

  Read the actual test files for segment 01. **Do this even if you believe you remember what you wrote.** You need to see the actual code to audit it.

- [ ] **Audit tests for segment 01**

  Audit the segment 01 tests for anti-patterns defined in the guide you just read. **Document your findings.** Write your findings to `notes/audit-findings-01.md`. State either "No issues found" or list each anti-pattern discovered. This file is required before marking this task complete. A no-op test in life-critical software is a silent failure waiting to happen.

- [ ] **Commit audit findings for segment 01**

  Stage and commit `notes/audit-findings-01.md`. Use message: "Add audit findings for segment 01: time and date"

- [ ] **Read TEST-AUDIT.md**

  Read `TEST-AUDIT.md` into context. **Do this even if you believe you have read it recently.**

- [ ] **Read the test files for segment 02**

  Read the actual test files for segment 02. **Do this even if you believe you remember what you wrote.** You need to see the actual code to audit it.

- [ ] **Audit tests for segment 02**

  Audit the segment 02 tests for anti-patterns defined in the guide you just read. **Document your findings.** Write your findings to `notes/audit-findings-02.md`. State either "No issues found" or list each anti-pattern discovered. This file is required before marking this task complete.

- [ ] **Commit audit findings for segment 02**

  Stage and commit `notes/audit-findings-02.md`. Use message: "Add audit findings for segment 02: pattern expansion"

- [ ] **Read TEST-AUDIT.md**

  Read `TEST-AUDIT.md` into context. **Do this even if you believe you have read it recently.**

- [ ] **Read the test files for segment 03**

  Read the actual test files for segment 03. **Do this even if you believe you remember what you wrote.** You need to see the actual code to audit it.

- [ ] **Audit tests for segment 03**

  Audit the segment 03 tests for anti-patterns defined in the guide you just read. **Document your findings.** Write your findings to `notes/audit-findings-03.md`. State either "No issues found" or list each anti-pattern discovered. This file is required before marking this task complete.

- [ ] **Commit audit findings for segment 03**

  Stage and commit `notes/audit-findings-03.md`. Use message: "Add audit findings for segment 03: condition evaluation"

- [ ] **Read TEST-AUDIT.md**

  Read `TEST-AUDIT.md` into context. **Do this even if you believe you have read it recently.**

- [ ] **Read the test files for segment 04**

  Read the actual test files for segment 04. **Do this even if you believe you remember what you wrote.** You need to see the actual code to audit it.

- [ ] **Audit tests for segment 04**

  Audit the segment 04 tests for anti-patterns defined in the guide you just read. **Document your findings.** Write your findings to `notes/audit-findings-04.md`. State either "No issues found" or list each anti-pattern discovered. This file is required before marking this task complete.

- [ ] **Commit audit findings for segment 04**

  Stage and commit `notes/audit-findings-04.md`. Use message: "Add audit findings for segment 04: adapter interface"

- [ ] **Read TEST-AUDIT.md**

  Read `TEST-AUDIT.md` into context. **Do this even if you believe you have read it recently.**

- [ ] **Read the test files for segment 05**

  Read the actual test files for segment 05. **Do this even if you believe you remember what you wrote.** You need to see the actual code to audit it.

- [ ] **Audit tests for segment 05**

  Audit the segment 05 tests for anti-patterns defined in the guide you just read. **Document your findings.** Write your findings to `notes/audit-findings-05.md`. State either "No issues found" or list each anti-pattern discovered. This file is required before marking this task complete.

- [ ] **Commit audit findings for segment 05**

  Stage and commit `notes/audit-findings-05.md`. Use message: "Add audit findings for segment 05: series CRUD"

- [ ] **Read TEST-AUDIT.md**

  Read `TEST-AUDIT.md` into context. **Do this even if you believe you have read it recently.**

- [ ] **Read the test files for segment 06**

  Read the actual test files for segment 06. **Do this even if you believe you remember what you wrote.** You need to see the actual code to audit it.

- [ ] **Audit tests for segment 06**

  Audit the segment 06 tests for anti-patterns defined in the guide you just read. **Document your findings.** Write your findings to `notes/audit-findings-06.md`. State either "No issues found" or list each anti-pattern discovered. This file is required before marking this task complete.

- [ ] **Commit audit findings for segment 06**

  Stage and commit `notes/audit-findings-06.md`. Use message: "Add audit findings for segment 06: completions"

- [ ] **Read TEST-AUDIT.md**

  Read `TEST-AUDIT.md` into context. **Do this even if you believe you have read it recently.**

- [ ] **Read the test files for segment 07**

  Read the actual test files for segment 07. **Do this even if you believe you remember what you wrote.** You need to see the actual code to audit it.

- [ ] **Audit tests for segment 07**

  Audit the segment 07 tests for anti-patterns defined in the guide you just read. **Document your findings.** Write your findings to `notes/audit-findings-07.md`. State either "No issues found" or list each anti-pattern discovered. This file is required before marking this task complete.

- [ ] **Commit audit findings for segment 07**

  Stage and commit `notes/audit-findings-07.md`. Use message: "Add audit findings for segment 07: cycling"

- [ ] **Read TEST-AUDIT.md**

  Read `TEST-AUDIT.md` into context. **Do this even if you believe you have read it recently.**

- [ ] **Read the test files for segment 08**

  Read the actual test files for segment 08. **Do this even if you believe you remember what you wrote.** You need to see the actual code to audit it.

- [ ] **Audit tests for segment 08**

  Audit the segment 08 tests for anti-patterns defined in the guide you just read. **Document your findings.** Write your findings to `notes/audit-findings-08.md`. State either "No issues found" or list each anti-pattern discovered. This file is required before marking this task complete. Every fake test is a lie that puts lives at risk.

- [ ] **Commit audit findings for segment 08**

  Stage and commit `notes/audit-findings-08.md`. Use message: "Add audit findings for segment 08: adaptive duration"

- [ ] **Read TEST-AUDIT.md**

  Read `TEST-AUDIT.md` into context. **Do this even if you believe you have read it recently.**

- [ ] **Read the test files for segment 09**

  Read the actual test files for segment 09. **Do this even if you believe you remember what you wrote.** You need to see the actual code to audit it.

- [ ] **Audit tests for segment 09**

  Audit the segment 09 tests for anti-patterns defined in the guide you just read. **Document your findings.** Write your findings to `notes/audit-findings-09.md`. State either "No issues found" or list each anti-pattern discovered. This file is required before marking this task complete.

- [ ] **Commit audit findings for segment 09**

  Stage and commit `notes/audit-findings-09.md`. Use message: "Add audit findings for segment 09: instance exceptions"

- [ ] **Read TEST-AUDIT.md**

  Read `TEST-AUDIT.md` into context. **Do this even if you believe you have read it recently.**

- [ ] **Read the test files for segment 10**

  Read the actual test files for segment 10. **Do this even if you believe you remember what you wrote.** You need to see the actual code to audit it.

- [ ] **Audit tests for segment 10**

  Audit the segment 10 tests for anti-patterns defined in the guide you just read. **Document your findings.** Write your findings to `notes/audit-findings-10.md`. State either "No issues found" or list each anti-pattern discovered. This file is required before marking this task complete.

- [ ] **Commit audit findings for segment 10**

  Stage and commit `notes/audit-findings-10.md`. Use message: "Add audit findings for segment 10: reminders"

- [ ] **Read TEST-AUDIT.md**

  Read `TEST-AUDIT.md` into context. **Do this even if you believe you have read it recently.**

- [ ] **Read the test files for segment 11**

  Read the actual test files for segment 11. **Do this even if you believe you remember what you wrote.** You need to see the actual code to audit it.

- [ ] **Audit tests for segment 11**

  Audit the segment 11 tests for anti-patterns defined in the guide you just read. **Document your findings.** Write your findings to `notes/audit-findings-11.md`. State either "No issues found" or list each anti-pattern discovered. This file is required before marking this task complete.

- [ ] **Commit audit findings for segment 11**

  Stage and commit `notes/audit-findings-11.md`. Use message: "Add audit findings for segment 11: links"

- [ ] **Read TEST-AUDIT.md**

  Read `TEST-AUDIT.md` into context. **Do this even if you believe you have read it recently.**

- [ ] **Read the test files for segment 12**

  Read the actual test files for segment 12. **Do this even if you believe you remember what you wrote.** You need to see the actual code to audit it.

- [ ] **Audit tests for segment 12**

  Audit the segment 12 tests for anti-patterns defined in the guide you just read. **Document your findings.** Write your findings to `notes/audit-findings-12.md`. State either "No issues found" or list each anti-pattern discovered. This file is required before marking this task complete.

- [ ] **Commit audit findings for segment 12**

  Stage and commit `notes/audit-findings-12.md`. Use message: "Add audit findings for segment 12: relational constraints"

- [ ] **Read TEST-AUDIT.md**

  Read `TEST-AUDIT.md` into context. **Do this even if you believe you have read it recently.**

- [ ] **Read the test files for segment 13**

  Read the actual test files for segment 13. **Do this even if you believe you remember what you wrote.** You need to see the actual code to audit it.

- [ ] **Audit tests for segment 13**

  Audit the segment 13 tests for anti-patterns defined in the guide you just read. **Document your findings.** Write your findings to `notes/audit-findings-13.md`. State either "No issues found" or list each anti-pattern discovered. This file is required before marking this task complete.

- [ ] **Commit audit findings for segment 13**

  Stage and commit `notes/audit-findings-13.md`. Use message: "Add audit findings for segment 13: reflow algorithm"

- [ ] **Read TEST-AUDIT.md**

  Read `TEST-AUDIT.md` into context. **Do this even if you believe you have read it recently.**

- [ ] **Read the test files for segment 14**

  Read the actual test files for segment 14. **Do this even if you believe you remember what you wrote.** You need to see the actual code to audit it.

- [ ] **Audit tests for segment 14**

  Audit the segment 14 tests for anti-patterns defined in the guide you just read. **Document your findings.** Write your findings to `notes/audit-findings-14.md`. State either "No issues found" or list each anti-pattern discovered. This file is required before marking this task complete.

- [ ] **Commit audit findings for segment 14**

  Stage and commit `notes/audit-findings-14.md`. Use message: "Add audit findings for segment 14: public API"

- [ ] **Read TEST-AUDIT.md**

  Read `TEST-AUDIT.md` into context. **Do this even if you believe you have read it recently.**

- [ ] **Read the test files for segment 15**

  Read the actual test files for segment 15. **Do this even if you believe you remember what you wrote.** You need to see the actual code to audit it.

- [ ] **Audit tests for segment 15**

  Audit the segment 15 tests for anti-patterns defined in the guide you just read. **Document your findings.** Write your findings to `notes/audit-findings-15.md`. State either "No issues found" or list each anti-pattern discovered. This file is required before marking this task complete.

- [ ] **Commit audit findings for segment 15**

  Stage and commit `notes/audit-findings-15.md`. Use message: "Add audit findings for segment 15: SQLite adapter"

- [ ] **Read TEST-AUDIT.md**

  Read `TEST-AUDIT.md` into context. **Do this even if you believe you have read it recently.**

- [ ] **Read the test files for segment 16**

  Read the actual test files for segment 16. **Do this even if you believe you remember what you wrote.** You need to see the actual code to audit it.

- [ ] **Audit tests for segment 16**

  Audit the segment 16 tests for anti-patterns defined in the guide you just read. **Document your findings.** Write your findings to `notes/audit-findings-16.md`. State either "No issues found" or list each anti-pattern discovered. This file is required before marking this task complete. This is the final audit before remediation—be thorough.

- [ ] **Commit audit findings for segment 16**

  Stage and commit `notes/audit-findings-16.md`. Use message: "Add audit findings for segment 16: integration tests"

- [ ] **Load project notes into context**

  Read all documents in `notes/` except testing-spec documents to understand the project architecture, requirements, and design decisions. **Do this even if you believe you have read these recently.** This is life-critical software; full context is essential. Files to read:
  - `concepts.md` - Core domain concepts
  - `requirements.md` - Functional requirements
  - `architecture-decisions.md` - Key design choices
  - `type-shapes.md` - Type definitions
  - `schema.md` - Database schema
  - `adapter-interface.md` - Storage adapter contract
  - `api-surface.md` - Public API shape
  - `recurrence-patterns.md` - Pattern syntax and semantics
  - `condition-syntax.md` - Condition DSL
  - `reflow-algorithm.md` - Scheduling algorithm overview
  - `testing-plan.md` - Original testing outline

  Exclude testing-spec documents as they are large and will be read individually during later steps.

- [ ] **Read findings for segment 01**

  Read `notes/review-findings-01.md` and `notes/audit-findings-01.md`. Note all issues requiring remediation. If both state "No issues found", this segment needs no fixes. For life-critical software, every documented issue must be addressed.

- [ ] **Fix issues for segment 01**

  Address each issue documented in the findings files. If no issues were found, note "No remediation needed" and proceed. Do not skip issues—lives depend on this software working correctly.

- [ ] **Verify fixes for segment 01**

  Re-run segment 01 tests. Confirm all tests execute correctly and the documented issues are resolved.

- [ ] **Commit fixes for segment 01**

  Stage and commit any changes to `tests/01-time-date.test.ts`. Use message: "Fix issues in segment 01 tests: time and date". If no fixes were needed, skip this commit.

- [ ] **Read findings for segment 02**

  Read `notes/review-findings-02.md` and `notes/audit-findings-02.md`. Note all issues requiring remediation. If both state "No issues found", this segment needs no fixes.

- [ ] **Fix issues for segment 02**

  Address each issue documented in the findings files. If no issues were found, note "No remediation needed" and proceed.

- [ ] **Verify fixes for segment 02**

  Re-run segment 02 tests. Confirm all tests execute correctly and the documented issues are resolved.

- [ ] **Commit fixes for segment 02**

  Stage and commit any changes to `tests/02-pattern-expansion.test.ts`. Use message: "Fix issues in segment 02 tests: pattern expansion". If no fixes were needed, skip this commit.

- [ ] **Read findings for segment 03**

  Read `notes/review-findings-03.md` and `notes/audit-findings-03.md`. Note all issues requiring remediation. If both state "No issues found", this segment needs no fixes.

- [ ] **Fix issues for segment 03**

  Address each issue documented in the findings files. If no issues were found, note "No remediation needed" and proceed.

- [ ] **Verify fixes for segment 03**

  Re-run segment 03 tests. Confirm all tests execute correctly and the documented issues are resolved.

- [ ] **Commit fixes for segment 03**

  Stage and commit any changes to `tests/03-condition-evaluation.test.ts`. Use message: "Fix issues in segment 03 tests: condition evaluation". If no fixes were needed, skip this commit.

- [ ] **Read findings for segment 04**

  Read `notes/review-findings-04.md` and `notes/audit-findings-04.md`. Note all issues requiring remediation. If both state "No issues found", this segment needs no fixes.

- [ ] **Fix issues for segment 04**

  Address each issue documented in the findings files. If no issues were found, note "No remediation needed" and proceed.

- [ ] **Verify fixes for segment 04**

  Re-run segment 04 tests. Confirm all tests execute correctly and the documented issues are resolved.

- [ ] **Commit fixes for segment 04**

  Stage and commit any changes to `tests/04-adapter.test.ts`. Use message: "Fix issues in segment 04 tests: adapter interface". If no fixes were needed, skip this commit.

- [ ] **Read findings for segment 05**

  Read `notes/review-findings-05.md` and `notes/audit-findings-05.md`. Note all issues requiring remediation. If both state "No issues found", this segment needs no fixes.

- [ ] **Fix issues for segment 05**

  Address each issue documented in the findings files. If no issues were found, note "No remediation needed" and proceed.

- [ ] **Verify fixes for segment 05**

  Re-run segment 05 tests. Confirm all tests execute correctly and the documented issues are resolved.

- [ ] **Commit fixes for segment 05**

  Stage and commit any changes to `tests/05-series-crud.test.ts`. Use message: "Fix issues in segment 05 tests: series CRUD". If no fixes were needed, skip this commit.

- [ ] **Load project notes into context**

  Read all documents in `notes/` except testing-spec documents to understand the project architecture, requirements, and design decisions. **Do this even if you believe you have read these recently.** This is life-critical software; full context is essential. Files to read:
  - `concepts.md` - Core domain concepts
  - `requirements.md` - Functional requirements
  - `architecture-decisions.md` - Key design choices
  - `type-shapes.md` - Type definitions
  - `schema.md` - Database schema
  - `adapter-interface.md` - Storage adapter contract
  - `api-surface.md` - Public API shape
  - `recurrence-patterns.md` - Pattern syntax and semantics
  - `condition-syntax.md` - Condition DSL
  - `reflow-algorithm.md` - Scheduling algorithm overview
  - `testing-plan.md` - Original testing outline

  Exclude testing-spec documents as they are large and will be read individually during later steps.

- [ ] **Read findings for segment 06**

  Read `notes/review-findings-06.md` and `notes/audit-findings-06.md`. Note all issues requiring remediation. If both state "No issues found", this segment needs no fixes.

- [ ] **Fix issues for segment 06**

  Address each issue documented in the findings files. If no issues were found, note "No remediation needed" and proceed.

- [ ] **Verify fixes for segment 06**

  Re-run segment 06 tests. Confirm all tests execute correctly and the documented issues are resolved.

- [ ] **Commit fixes for segment 06**

  Stage and commit any changes to `tests/06-completions.test.ts`. Use message: "Fix issues in segment 06 tests: completions". If no fixes were needed, skip this commit.

- [ ] **Read findings for segment 07**

  Read `notes/review-findings-07.md` and `notes/audit-findings-07.md`. Note all issues requiring remediation. If both state "No issues found", this segment needs no fixes.

- [ ] **Fix issues for segment 07**

  Address each issue documented in the findings files. If no issues were found, note "No remediation needed" and proceed.

- [ ] **Verify fixes for segment 07**

  Re-run segment 07 tests. Confirm all tests execute correctly and the documented issues are resolved.

- [ ] **Commit fixes for segment 07**

  Stage and commit any changes to `tests/07-cycling.test.ts`. Use message: "Fix issues in segment 07 tests: cycling". If no fixes were needed, skip this commit.

- [ ] **Read findings for segment 08**

  Read `notes/review-findings-08.md` and `notes/audit-findings-08.md`. Note all issues requiring remediation. If both state "No issues found", this segment needs no fixes.

- [ ] **Fix issues for segment 08**

  Address each issue documented in the findings files. If no issues were found, note "No remediation needed" and proceed. Life-critical software demands complete remediation.

- [ ] **Verify fixes for segment 08**

  Re-run segment 08 tests. Confirm all tests execute correctly and the documented issues are resolved.

- [ ] **Commit fixes for segment 08**

  Stage and commit any changes to `tests/08-adaptive-duration.test.ts`. Use message: "Fix issues in segment 08 tests: adaptive duration". If no fixes were needed, skip this commit.

- [ ] **Read findings for segment 09**

  Read `notes/review-findings-09.md` and `notes/audit-findings-09.md`. Note all issues requiring remediation. If both state "No issues found", this segment needs no fixes.

- [ ] **Fix issues for segment 09**

  Address each issue documented in the findings files. If no issues were found, note "No remediation needed" and proceed.

- [ ] **Verify fixes for segment 09**

  Re-run segment 09 tests. Confirm all tests execute correctly and the documented issues are resolved.

- [ ] **Commit fixes for segment 09**

  Stage and commit any changes to `tests/09-instance-exceptions.test.ts`. Use message: "Fix issues in segment 09 tests: instance exceptions". If no fixes were needed, skip this commit.

- [ ] **Read findings for segment 10**

  Read `notes/review-findings-10.md` and `notes/audit-findings-10.md`. Note all issues requiring remediation. If both state "No issues found", this segment needs no fixes.

- [ ] **Fix issues for segment 10**

  Address each issue documented in the findings files. If no issues were found, note "No remediation needed" and proceed.

- [ ] **Verify fixes for segment 10**

  Re-run segment 10 tests. Confirm all tests execute correctly and the documented issues are resolved.

- [ ] **Commit fixes for segment 10**

  Stage and commit any changes to `tests/10-reminders.test.ts`. Use message: "Fix issues in segment 10 tests: reminders". If no fixes were needed, skip this commit.

- [ ] **Load project notes into context**

  Read all documents in `notes/` except testing-spec documents to understand the project architecture, requirements, and design decisions. **Do this even if you believe you have read these recently.** This is life-critical software; full context is essential. Files to read:
  - `concepts.md` - Core domain concepts
  - `requirements.md` - Functional requirements
  - `architecture-decisions.md` - Key design choices
  - `type-shapes.md` - Type definitions
  - `schema.md` - Database schema
  - `adapter-interface.md` - Storage adapter contract
  - `api-surface.md` - Public API shape
  - `recurrence-patterns.md` - Pattern syntax and semantics
  - `condition-syntax.md` - Condition DSL
  - `reflow-algorithm.md` - Scheduling algorithm overview
  - `testing-plan.md` - Original testing outline

  Exclude testing-spec documents as they are large and will be read individually during later steps.

- [ ] **Read findings for segment 11**

  Read `notes/review-findings-11.md` and `notes/audit-findings-11.md`. Note all issues requiring remediation. If both state "No issues found", this segment needs no fixes.

- [ ] **Fix issues for segment 11**

  Address each issue documented in the findings files. If no issues were found, note "No remediation needed" and proceed.

- [ ] **Verify fixes for segment 11**

  Re-run segment 11 tests. Confirm all tests execute correctly and the documented issues are resolved.

- [ ] **Commit fixes for segment 11**

  Stage and commit any changes to `tests/11-links.test.ts`. Use message: "Fix issues in segment 11 tests: links". If no fixes were needed, skip this commit.

- [ ] **Read findings for segment 12**

  Read `notes/review-findings-12.md` and `notes/audit-findings-12.md`. Note all issues requiring remediation. If both state "No issues found", this segment needs no fixes.

- [ ] **Fix issues for segment 12**

  Address each issue documented in the findings files. If no issues were found, note "No remediation needed" and proceed.

- [ ] **Verify fixes for segment 12**

  Re-run segment 12 tests. Confirm all tests execute correctly and the documented issues are resolved.

- [ ] **Commit fixes for segment 12**

  Stage and commit any changes to `tests/12-relational-constraints.test.ts`. Use message: "Fix issues in segment 12 tests: relational constraints". If no fixes were needed, skip this commit.

- [ ] **Read findings for segment 13**

  Read `notes/review-findings-13.md` and `notes/audit-findings-13.md`. Note all issues requiring remediation. If both state "No issues found", this segment needs no fixes.

- [ ] **Fix issues for segment 13**

  Address each issue documented in the findings files. If no issues were found, note "No remediation needed" and proceed. The reflow algorithm is central to this life-critical system—fix everything.

- [ ] **Verify fixes for segment 13**

  Re-run segment 13 tests. Confirm all tests execute correctly and the documented issues are resolved.

- [ ] **Commit fixes for segment 13**

  Stage and commit any changes to `tests/13-reflow-algorithm.test.ts`. Use message: "Fix issues in segment 13 tests: reflow algorithm". If no fixes were needed, skip this commit.

- [ ] **Read findings for segment 14**

  Read `notes/review-findings-14.md` and `notes/audit-findings-14.md`. Note all issues requiring remediation. If both state "No issues found", this segment needs no fixes.

- [ ] **Fix issues for segment 14**

  Address each issue documented in the findings files. If no issues were found, note "No remediation needed" and proceed.

- [ ] **Verify fixes for segment 14**

  Re-run segment 14 tests. Confirm all tests execute correctly and the documented issues are resolved.

- [ ] **Commit fixes for segment 14**

  Stage and commit any changes to `tests/14-public-api.test.ts`. Use message: "Fix issues in segment 14 tests: public API". If no fixes were needed, skip this commit.

- [ ] **Read findings for segment 15**

  Read `notes/review-findings-15.md` and `notes/audit-findings-15.md`. Note all issues requiring remediation. If both state "No issues found", this segment needs no fixes.

- [ ] **Fix issues for segment 15**

  Address each issue documented in the findings files. If no issues were found, note "No remediation needed" and proceed.

- [ ] **Verify fixes for segment 15**

  Re-run segment 15 tests. Confirm all tests execute correctly and the documented issues are resolved.

- [ ] **Commit fixes for segment 15**

  Stage and commit any changes to `tests/15-sqlite-adapter.test.ts`. Use message: "Fix issues in segment 15 tests: SQLite adapter". If no fixes were needed, skip this commit.

- [ ] **Read findings for segment 16**

  Read `notes/review-findings-16.md` and `notes/audit-findings-16.md`. Note all issues requiring remediation. If both state "No issues found", this segment needs no fixes.

- [ ] **Fix issues for segment 16**

  Address each issue documented in the findings files. If no issues were found, note "No remediation needed" and proceed.

- [ ] **Verify fixes for segment 16**

  Re-run segment 16 tests. Confirm all tests execute correctly and the documented issues are resolved. This completes remediation for life-critical software—ensure nothing was missed.

- [ ] **Commit fixes for segment 16**

  Stage and commit any changes to `tests/16-integration.test.ts`. Use message: "Fix issues in segment 16 tests: integration tests". If no fixes were needed, skip this commit.

- [ ] **Read TEST-AUDIT.md**

  Read `TEST-AUDIT.md` into context. **Do this even if you believe you have read it recently.** You will be re-auditing all tests to verify remediation did not introduce new anti-patterns. Fixes that introduce new problems are unacceptable in life-critical software.

- [ ] **Re-audit tests for segment 01**

  Scan the segment 01 tests for anti-patterns that may have been introduced during remediation. Focus on the areas that were modified. If new issues are found, fix them immediately. Note any fixes made.

- [ ] **Re-audit tests for segment 02**

  Scan the segment 02 tests for anti-patterns that may have been introduced during remediation. Focus on the areas that were modified. If new issues are found, fix them immediately. Note any fixes made.

- [ ] **Re-audit tests for segment 03**

  Scan the segment 03 tests for anti-patterns that may have been introduced during remediation. Focus on the areas that were modified. If new issues are found, fix them immediately. Note any fixes made.

- [ ] **Re-audit tests for segment 04**

  Scan the segment 04 tests for anti-patterns that may have been introduced during remediation. Focus on the areas that were modified. If new issues are found, fix them immediately. Note any fixes made.

- [ ] **Re-audit tests for segment 05**

  Scan the segment 05 tests for anti-patterns that may have been introduced during remediation. Focus on the areas that were modified. If new issues are found, fix them immediately. Note any fixes made.

- [ ] **Re-audit tests for segment 06**

  Scan the segment 06 tests for anti-patterns that may have been introduced during remediation. Focus on the areas that were modified. If new issues are found, fix them immediately. Note any fixes made.

- [ ] **Re-audit tests for segment 07**

  Scan the segment 07 tests for anti-patterns that may have been introduced during remediation. Focus on the areas that were modified. If new issues are found, fix them immediately. Note any fixes made.

- [ ] **Re-audit tests for segment 08**

  Scan the segment 08 tests for anti-patterns that may have been introduced during remediation. Focus on the areas that were modified. If new issues are found, fix them immediately. Note any fixes made.

- [ ] **Re-audit tests for segment 09**

  Scan the segment 09 tests for anti-patterns that may have been introduced during remediation. Focus on the areas that were modified. If new issues are found, fix them immediately. Note any fixes made.

- [ ] **Re-audit tests for segment 10**

  Scan the segment 10 tests for anti-patterns that may have been introduced during remediation. Focus on the areas that were modified. If new issues are found, fix them immediately. Note any fixes made.

- [ ] **Re-audit tests for segment 11**

  Scan the segment 11 tests for anti-patterns that may have been introduced during remediation. Focus on the areas that were modified. If new issues are found, fix them immediately. Note any fixes made.

- [ ] **Re-audit tests for segment 12**

  Scan the segment 12 tests for anti-patterns that may have been introduced during remediation. Focus on the areas that were modified. If new issues are found, fix them immediately. Note any fixes made.

- [ ] **Re-audit tests for segment 13**

  Scan the segment 13 tests for anti-patterns that may have been introduced during remediation. Focus on the areas that were modified. If new issues are found, fix them immediately. Note any fixes made.

- [ ] **Re-audit tests for segment 14**

  Scan the segment 14 tests for anti-patterns that may have been introduced during remediation. Focus on the areas that were modified. If new issues are found, fix them immediately. Note any fixes made.

- [ ] **Re-audit tests for segment 15**

  Scan the segment 15 tests for anti-patterns that may have been introduced during remediation. Focus on the areas that were modified. If new issues are found, fix them immediately. Note any fixes made.

- [ ] **Re-audit tests for segment 16**

  Scan the segment 16 tests for anti-patterns that may have been introduced during remediation. Focus on the areas that were modified. If new issues are found, fix them immediately. Note any fixes made. This is the final quality gate before full verification of life-critical software.

- [ ] **Commit re-audit fixes**

  Stage and commit any test files modified during re-audit. Use message: "Fix re-audit issues across all segments". If no fixes were needed during re-audit, skip this commit.

- [ ] **Run full test suite**

  Run all tests together. Verify no unexpected interactions between segments. Confirm total test count matches expected from all test plans. This is the moment of truth for life-critical software—every test must behave as expected.

- [ ] **Coverage analysis**

  Generate test coverage report. Identify any gaps in coverage. Cross-reference against formal specs to ensure all laws/invariants have corresponding tests. Uncovered code in life-critical software is unverified code.

- [ ] **Document test inventory**

  Create a summary document at `notes/test-inventory.md` listing total tests per segment, coverage metrics, and any known gaps or deferred tests with rationale. This file is required before marking this task complete. This inventory is the permanent record of test coverage for this life-critical system.

- [ ] **Commit test inventory**

  Stage and commit `notes/test-inventory.md`. Use message: "Add test inventory for life-critical autoplanner test suite"
