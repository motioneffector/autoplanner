# REPORT-SPEC.md - Mandatory Requirements for Test Analysis

## Context

This document specifies the exact requirements for analyzing the 148 WEAK_ASSERTION test violations identified by ClaudeCatcher. This is LIFE CRITICAL SOFTWARE. Every requirement in this document is mandatory and non-negotiable.

---

## Task Structure

1. **One task per test** - Create 148 individual tasks, one for each test violation in REPORT.md
2. **Strict sequential chaining** - Each task is blocked by the previous task (task 2 blocked by task 1, task 3 blocked by task 2, etc.)
3. **No batching** - Tasks are added one at a time, alternating between creating a task and linking it to the prior one
4. **No parallelization** - Execute one test at a time, in sequence, with zero parallel work

---

## Per-Test Deliverable

For each of the 148 tests, append to REPORT.md a detailed analysis answering these four questions:

### Question 1: Purpose & Importance
- What is this test actually testing?
- What functionality or behavior is it verifying?
- Why does this specific test matter?
- What are the consequences if this test is wrong or weak?
- Why does getting it right matter?

### Question 2: Codebase Utilization Analysis
- How is the functionality under test actually used throughout the codebase?
- **Every claim must include file:line citations to the actual source code**
- No claims without citations
- Trace how the functionality flows through the system

### Question 3: Platonic Ideal
- Given the answers to questions 1 and 2, what would the ideal version of this test look like?
- What assertions would perfectly verify the intended behavior?
- How would the ideal test avoid being weak or tautological?
- What specific changes would transform this test into its ideal form?

### Question 4: Research Methodology
- What specific actions were taken to gather the information?
- Which files were read? (with line numbers)
- What searches were run? (with exact patterns)
- How was the functionality traced through the codebase?

---

## CRITICAL: Research Requirements for Question 4

### Forbidden Approaches
Question 4 must NEVER contain:
- "Similar to test #X..."
- "As established earlier..."
- "Based on prior analysis..."
- "I already knew from..."
- "I inferred that..."
- "Based on patterns I've seen..."
- "I used information from prior answers in this document"
- Any reference to work done on other tests
- Any guessing or inferring

### Mandatory Approaches
Question 4 MUST ALWAYS contain:
- The actual Read tool calls made for THIS specific test
- The actual Grep/Glob searches run for THIS specific test
- The actual files and line numbers examined for THIS specific test
- Fresh, independent research conducted specifically for this test

### The Core Rule
**EVERY SINGLE TEST GETS FRESH, INDEPENDENT RESEARCH.**

Even if:
- The same file was read 5 minutes ago for another test
- The same function was analyzed in a previous test
- The pattern looks identical to the last 10 tests
- The answer seems "obvious" from prior work

For EVERY test, regardless of what has been seen before:
1. **Read the specific test** - Use Read tool to look at that exact line in that exact file, fresh
2. **Run fresh searches** - Use Grep/Glob to find where the tested functionality exists in source code
3. **Read the source files** - Actually open and read implementation files again
4. **Document the actual tool calls** - List the literal actions taken for THIS test

### Why This Matters
- Each test has unique context and intent
- Assumptions from prior tests may be wrong for this test
- Lazy pattern-matching kills people when this is life critical software
- The goal is understanding, not efficiency

---

## Execution Order

1. Create task for test #1
2. Create task for test #2, link as blocked by task #1
3. Continue until all 148 tasks exist in the sequential chain
4. Execute task #1 fully:
   - Conduct fresh research
   - Answer all 4 questions
   - Write analysis to REPORT.md
5. Mark task #1 complete
6. Execute task #2 fully (with completely fresh research)
7. Repeat until all 148 tests are analyzed

---

## Test List Reference

The 148 tests to be analyzed are documented in REPORT.md, organized by file:

- tests/04-adapter.test.ts (17 violations)
- tests/05-series-crud.test.ts (4 violations)
- tests/06-completions.test.ts (2 violations)
- tests/07-cycling.test.ts (1 violation)
- tests/09-instance-exceptions.test.ts (2 violations)
- tests/10-reminders.test.ts (11 violations)
- tests/11-links.test.ts (3 violations)
- tests/12-relational-constraints.test.ts (5 violations)
- tests/13-reflow-algorithm.test.ts (15 violations)
- tests/14-public-api.test.ts (4 violations)
- tests/15-sqlite-adapter.test.ts (5 violations)
- tests/16-integration.test.ts (13 violations)
- tests/fuzz/generators/domain.test.ts (3 violations)
- tests/fuzz/generators/patterns.test.ts (7 violations)
- tests/fuzz/integration/stress.test.ts (15 violations)
- tests/fuzz/invariants/invariants.test.ts (6 violations)
- tests/fuzz/lib/harness.test.ts (1 violation)
- tests/fuzz/properties/completions.test.ts (6 violations)
- tests/fuzz/properties/constraints.test.ts (2 violations)
- tests/fuzz/properties/instances.test.ts (4 violations)
- tests/fuzz/properties/links.test.ts (1 violation)
- tests/fuzz/properties/pattern-crud.test.ts (4 violations)
- tests/fuzz/properties/reflow.test.ts (1 violation)
- tests/fuzz/properties/series.test.ts (7 violations)
- tests/fuzz/properties/temporal.test.ts (1 violation)
- tests/fuzz/properties/transactions.test.ts (2 violations)
- tests/fuzz/shrinking/shrinking.test.ts (6 violations)

**Total: 148 tests requiring individual analysis**

---

## Summary of Non-Negotiable Rules

1. One test at a time
2. Fresh research for every test
3. No batching
4. No parallelization
5. No inference from prior work
6. All claims require citations
7. Document actual tool calls made
8. Each test is an isolated research project
9. Test #148 gets the same fresh investigation as test #1

---

*This specification must be followed exactly. No shortcuts. No efficiency optimizations. Each test deserves and requires individual attention and respect for its unique intent and context.*
