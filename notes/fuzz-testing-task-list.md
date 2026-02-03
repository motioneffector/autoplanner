# Fuzz-Testing Suite Implementation — Granular Task List

## Phase 1: Foundation Infrastructure

### 1.1 Project Setup
1. Create `tests/fuzz/` directory structure with subdirectories for each layer
2. Install fast-check and configure vitest for property-based testing
3. Create `tests/fuzz/lib/` for shared utilities and types
4. Create base `Arbitrary` type definitions matching fast-check conventions
5. Create test harness with configurable iteration counts (CI vs local)

### 1.2 Primitive Generators (Layer 1)
6. Implement `gen.localDate.standard` — random valid dates 1970-2100
7. Implement `gen.localDate.boundary` — epoch, overflow, leap days, DST dates, month ends
8. Implement `gen.localDate.invalid` — malformed and impossible dates
9. Implement `gen.localTime.standard` — random valid HH:MM times
10. Implement `gen.localTime.boundary` — midnight, 23:59, noon, DST gap/ambiguous times
11. Implement `gen.localTime.fiveMinuteAligned` — reflow-compatible times
12. Implement `gen.localDateTime.standard` — composed date+time
13. Implement `gen.localDateTime.boundary` — DST gaps, day/year boundaries
14. Implement `gen.duration.standard` — 1-480 minutes
15. Implement `gen.duration.boundary` — 0, 1, 5, 1440
16. Implement branded ID generators (seriesId, completionId, conditionId, constraintId, patternId)
17. Write generator validation tests — verify all generators produce syntactically valid values

### 1.3 Domain Model Generators (Layer 2)
18. Implement `gen.pattern.daily`
19. Implement `gen.pattern.everyNDays` with n ∈ [2, 365]
20. Implement `gen.pattern.weekly` with non-empty day subset
21. Implement `gen.pattern.everyNWeeks`
22. Implement `gen.pattern.monthly` with day ∈ [1, 31]
23. Implement `gen.pattern.nthWeekdayOfMonth` with n ∈ [1, 5]
24. Implement `gen.pattern.lastDayOfMonth`
25. Implement `gen.pattern.yearly` with month/day
26. Implement `gen.pattern.weekdays`
27. Implement `gen.pattern.oneOff` with single date
28. Implement `gen.pattern.custom` with date array
29. Implement `gen.pattern.activeOnDates` with recursive base pattern (depth-limited)
30. Implement `gen.pattern.inactiveOnDates` with recursive base pattern
31. Implement `gen.pattern.any` — uniform selection from all pattern types
32. Implement `gen.pattern.boundary` — edge case patterns (day 31, Feb 29, 5th weekday)
33. Implement `gen.condition.count` with target, comparison, threshold, windowDays
34. Implement `gen.condition.daysSince` with target, comparison, threshold
35. Implement `gen.condition.and` with depth-limited recursion
36. Implement `gen.condition.or` with depth-limited recursion
37. Implement `gen.condition.not` with depth-limited recursion
38. Implement `gen.condition.leaf` — only count/daysSince
39. Implement `gen.condition.any` with depth parameter
40. Implement `gen.condition.boundary` — empty AND/OR, deep nesting, zero thresholds
41. Implement `gen.target` — tag or seriesId variants
42. Implement `gen.series.minimal` — id, title, single pattern
43. Implement `gen.series.full` — all optional fields populated
44. Implement `gen.series.withChain` — series configured for linking
45. Implement `gen.series.withConditions` — patterns with conditionIds
46. Implement `gen.link` with targetDistance, earlyWobble, lateWobble
47. Implement `gen.linkBoundary` — exact sync, next-day, laundry scenario
48. Implement `gen.relationalConstraint` — all 7 constraint types
49. Implement `gen.relationalConstraintValid` — withinMinutes only for mustBeWithin
50. Implement `gen.completion` — valid startTime/endTime pairs
51. Implement `gen.completionValid` — completion for specific series/date
52. Implement `gen.adaptiveDuration` — lastN and windowDays modes
53. Implement `gen.adaptiveDurationBoundary` — minimum values, max multiplier
54. Implement `gen.wiggleConfig` — daysBefore, daysAfter, timeWindow
55. Implement `gen.reminder` — minutesBefore and tag
56. Implement `gen.cyclingConfig` — items array, mode, gapLeap
57. Implement `gen.bounds` — startDate and optional endDate
58. Write domain generator validation tests — verify generated objects match type schemas

---

## Phase 2: Property Tests by Specification

### 2.1 Temporal Properties (Spec 1 — 50 laws)
59. Property: parseDate ∘ formatDate = identity
60. Property: parseTime ∘ formatTime = identity
61. Property: parseDateTime ∘ formatDateTime = identity
62. Property: date comparison is reflexive (a = a)
63. Property: date comparison is antisymmetric
64. Property: date comparison is transitive
65. Property: time comparison is reflexive
66. Property: time comparison is antisymmetric
67. Property: time comparison is transitive
68. Property: dateTime comparison is reflexive
69. Property: dateTime comparison is antisymmetric
70. Property: dateTime comparison is transitive
71. Property: addDays(d, n) then addDays(-n) = d
72. Property: addDays(d, 0) = d
73. Property: addDays is monotonic (n > 0 → result > d)
74. Property: addMinutes(dt, n) then addMinutes(-n) = dt
75. Property: addMinutes(dt, 0) = dt
76. Property: addMinutes is monotonic
77. Property: dayOfWeek returns 0-6
78. Property: dayOfWeek consistent across addDays(7)
79. Property: minutesBetween(a, b) = -minutesBetween(b, a)
80. Property: minutesBetween(a, a) = 0
81. Property: daysBetween(a, b) = -daysBetween(b, a)
82. Property: daysBetween(a, a) = 0
83. Property: lastDayOfMonth returns 28-31
84. Property: lastDayOfMonth(Feb) = 29 iff leap year
85. Property: lastDayOfMonth consistent with isLeapYear
86. Property: isLeapYear follows Gregorian rules
87. Property: DST gap times resolve to valid time
88. Property: DST ambiguous times resolve deterministically
89. Property: combineDateAndTime produces valid dateTime
90. Property: extractDate from dateTime matches original date
91. Property: extractTime from dateTime matches original time

### 2.2 Pattern Expansion Properties (Spec 2 — 53 laws)
92. Property: pattern expansion is deterministic
93. Property: expanded dates within range bounds
94. Property: expanded dates are sorted ascending
95. Property: expanded dates have no duplicates
96. Property: daily pattern produces consecutive dates
97. Property: daily pattern count = days in range + 1
98. Property: everyNDays produces dates exactly N apart
99. Property: everyNDays respects anchor date
100. Property: weekly pattern only produces specified weekdays
101. Property: weekly pattern produces all specified weekdays each week
102. Property: everyNWeeks produces correct week spacing
103. Property: everyNWeeks only on specified days
104. Property: monthly pattern produces same day (clamped)
105. Property: monthly day 31 clamps to actual month end
106. Property: monthly day 30 clamps in February
107. Property: nthWeekdayOfMonth produces correct weekday
108. Property: nthWeekdayOfMonth n=5 skips months without 5th occurrence
109. Property: lastDayOfMonth produces actual last day
110. Property: lastDayOfMonth handles Feb correctly
111. Property: yearly produces same month/day yearly (clamped)
112. Property: yearly Feb 29 only in leap years
113. Property: weekdays produces Mon-Fri only
114. Property: weekdays produces 5 dates per full week
115. Property: oneOff produces exactly one date
116. Property: oneOff date matches specified date
117. Property: custom produces exactly specified dates
118. Property: custom filters to range
119. Property: activeOnDates restricts base pattern to specified dates
120. Property: activeOnDates ∩ base pattern
121. Property: inactiveOnDates excludes specified dates from base
122. Property: inactiveOnDates = base - specified
123. Property: empty range produces empty result
124. Property: range before pattern anchor produces empty/partial result

### 2.3 Condition Evaluation Properties (Spec 3 — 40 laws)
125. Property: AND with empty conditions = true
126. Property: OR with empty conditions = false
127. Property: NOT(NOT(x)) = x
128. Property: De Morgan — NOT(A AND B) = NOT(A) OR NOT(B)
129. Property: De Morgan — NOT(A OR B) = NOT(A) AND NOT(B)
130. Property: AND is commutative
131. Property: OR is commutative
132. Property: AND is associative
133. Property: OR is associative
134. Property: count with 0 completions = 0
135. Property: count comparison operators work correctly
136. Property: count windowDays is inclusive of both endpoints
137. Property: count only counts matching target (tag or seriesId)
138. Property: daysSince with no completions = infinity (satisfies >= any threshold)
139. Property: daysSince = 0 when completion today
140. Property: daysSince comparison operators work correctly
141. Property: condition evaluation is deterministic
142. Property: tag target matches all series with that tag
143. Property: seriesId target matches only that series
144. Property: non-existent target = 0 count / infinite daysSince

### 2.4 Adapter Properties (Spec 4 — 68 laws)
145. Property: transaction commits all changes on success
146. Property: transaction rolls back all changes on exception
147. Property: transaction rollback restores exact prior state
148. Property: nested transactions flatten (inner commit doesn't persist if outer fails)
149. Property: createSeries then getSeries returns created entity
150. Property: createSeries generates unique ID
151. Property: getSeries for non-existent ID returns null
152. Property: updateSeries modifies only specified fields
153. Property: updateSeries preserves unspecified fields
154. Property: deleteSeries then getSeries returns null
155. Property: deleteSeries cascades to patterns
156. Property: deleteSeries cascades to conditions
157. Property: deleteSeries cascades to reminders
158. Property: deleteSeries cascades to instance exceptions
159. Property: deleteSeries cascades to cycling config
160. Property: deleteSeries cascades to adaptive duration
161. Property: deleteSeries cascades to series_tag
162. Property: deleteSeries RESTRICT by completions
163. Property: deleteSeries RESTRICT by child links
164. Property: getAllSeries returns all created series
165. Property: getSeriesByTag returns only series with that tag
166. Property: createPattern associates with series
167. Property: deletePattern removes from series
168. Property: createCondition returns valid ID
169. Property: condition tree deletion cascades to children
170. Property: createCompletion then getCompletion returns it
171. Property: deleteCompletion removes it
172. Property: countCompletionsInWindow returns correct count
173. Property: daysSinceLastCompletion returns correct value
174. Property: createLink establishes relationship
175. Property: getLink returns link for child
176. Property: deleteLink removes relationship
177. Property: createConstraint returns valid ID
178. Property: deleteConstraint removes it
179. Property: getAllConstraints returns all constraints

### 2.5 Series CRUD Properties (Spec 5 — 25 laws)
180. Property: locked series rejects updateSeries
181. Property: locked series rejects deleteSeries
182. Property: lock is idempotent
183. Property: unlock is idempotent
184. Property: unlock then update succeeds
185. Property: splitSeries creates new series with new ID
186. Property: splitSeries — original series endDate set to splitDate - 1
187. Property: splitSeries — new series startDate = splitDate
188. Property: splitSeries — completions stay with original
189. Property: splitSeries — new series has no completions
190. Property: splitSeries — cycling state copied to new series
191. Property: tags are unique per series (no duplicates)
192. Property: addTag then getSeriesByTag includes series
193. Property: removeTag then getSeriesByTag excludes series

### 2.6 Completion Properties (Spec 6 — 26 laws)
194. Property: completion endTime >= startTime
195. Property: duplicate completion for same instance throws
196. Property: completion date matches instance date
197. Property: deleteCompletion removes from counts
198. Property: getCompletions with tag returns all matching
199. Property: getCompletions respects windowDays
200. Property: completion advances cycling (if gapLeap)

### 2.7 Cycling Properties (Spec 7 — 19 laws)
201. Property: sequential cycling wraps at items.length
202. Property: sequential cycling advances by 1 on completion
203. Property: gapLeap=true — skip doesn't advance
204. Property: gapLeap=false — index based on instance number
205. Property: random cycling selects from items
206. Property: random cycling distribution (statistical test)
207. Property: cycling state persists across series update
208. Property: cycling state copied on split
209. Property: getCurrentItem returns items[currentIndex]

### 2.8 Adaptive Duration Properties (Spec 8 — 13 laws)
210. Property: no history returns fallback
211. Property: lastN mode averages last N completions
212. Property: windowDays mode averages completions in window
213. Property: multiplier applied to average
214. Property: result is ceiling (rounded up)
215. Property: result is deterministic

### 2.9 Instance Exception Properties (Spec 9 — 20 laws)
216. Property: cancelInstance excludes from schedule
217. Property: cancelInstance is idempotent
218. Property: cancel non-existent instance throws NonExistentInstanceError
219. Property: cancel already-cancelled throws AlreadyCancelledError
220. Property: rescheduleInstance changes time in schedule
221. Property: reschedule cancelled throws CancelledInstanceError
222. Property: reschedule non-existent throws NonExistentInstanceError
223. Property: restoreInstance un-cancels
224. Property: restore non-cancelled is no-op
225. Property: exceptions persist across reflow

### 2.10 Reminder Properties (Spec 10 — 22 laws)
226. Property: reminder fires at scheduledTime - minutesBefore
227. Property: acknowledged reminder not pending
228. Property: acknowledgment is instance-specific
229. Property: new instance = new reminder (not acknowledged)
230. Property: all-day reminder fires relative to 00:00
231. Property: getPendingReminders returns unacknowledged due reminders
232. Property: acknowledgeReminder is idempotent

### 2.11 Link Properties (Spec 11 — 26 laws)
233. Property: link creates parent-child relationship
234. Property: child has exactly one parent (or none)
235. Property: unlinkSeries removes relationship
236. Property: cycle detection prevents A→B→A
237. Property: cycle detection prevents longer cycles
238. Property: depth limit enforced (max 32)
239. Property: chain of 32 succeeds
240. Property: chain of 33 throws ChainDepthExceededError
241. Property: child scheduled relative to parent end
242. Property: child within [target - earlyWobble, target + lateWobble]
243. Property: after parent completion, child uses actual endTime
244. Property: before parent completion, child uses scheduled duration
245. Property: deleting parent with children throws LinkedChildrenExistError
246. Property: unlink then delete parent succeeds

### 2.12 Relational Constraint Properties (Spec 12 — 17 laws)
247. Property: mustBeOnSameDay satisfied when dates equal
248. Property: mustBeOnSameDay violated when dates differ
249. Property: cantBeOnSameDay satisfied when dates differ
250. Property: cantBeOnSameDay violated when dates equal
251. Property: mustBeNextTo satisfied when adjacent
252. Property: cantBeNextTo satisfied when not adjacent
253. Property: mustBeBefore satisfied when source.end <= dest.start
254. Property: mustBeAfter satisfied when source.start >= dest.end
255. Property: mustBeWithin satisfied when gap <= withinMinutes
256. Property: empty source or dest = constraint satisfied
257. Property: constraint with non-existent target = no-op
258. Property: orphaned constraint (deleted series) remains but matches nothing
259. Property: withinMinutes required iff type = mustBeWithin
260. Property: withinMinutes >= 0

### 2.13 Reflow Properties (Spec 13 — 28 laws)
261. Property: reflow is deterministic
262. Property: instances respect series bounds
263. Property: cancelled instances excluded
264. Property: rescheduled instances use new time as ideal
265. Property: conditions evaluated as of reflow date
266. Property: duration calculated once at reflow start
267. Property: fixed domain has exactly one slot
268. Property: flexible domain bounded by wiggle config
269. Property: all-day excluded from reflow
270. Property: arc consistency prunes impossible values
271. Property: if domain empty, no solution
272. Property: propagation is sound (doesn't remove valid solutions)
273. Property: soundness — if returns assignment, all constraints satisfied
274. Property: completeness — if valid arrangement exists, finds one
275. Property: termination — algorithm always terminates
276. Property: fixed items ALWAYS at their time
277. Property: fixed-fixed overlaps allowed (warning, not error)
278. Property: best-effort placement for flexible items
279. Property: all conflicts reported
280. Property: day balancing prefers less loaded days
281. Property: balancing secondary to constraint satisfaction

### 2.14 Public API Properties (Spec 14 — 22 laws)
282. Property: all input times interpreted as configured timezone
283. Property: all output times in configured timezone
284. Property: DST transitions handled per Spec 1 rules
285. Property: reflow triggered by createSeries
286. Property: reflow triggered by updateSeries
287. Property: reflow triggered by deleteSeries
288. Property: reflow triggered by linkSeries/unlinkSeries
289. Property: reflow triggered by addConstraint/removeConstraint
290. Property: reflow triggered by cancelInstance/rescheduleInstance
291. Property: reflow triggered by logCompletion
292. Property: getSchedule returns post-reflow state
293. Property: reflow is synchronous
294. Property: all errors include descriptive message
295. Property: failed operations don't mutate state
296. Property: lock/unlock are idempotent
297. Property: acknowledgeReminder is idempotent
298. Property: events fire after state mutation complete
299. Property: event handlers receive immutable snapshots
300. Property: errors in handlers don't affect API operation

### 2.15 SQLite Adapter Properties (Spec 15 — 29 laws)
301. Property: BEGIN IMMEDIATE used for transactions
302. Property: nested transactions flatten correctly
303. Property: rollback restores exact prior state
304. Property: commit is durable (survives reconnect)
305. Property: foreign keys enabled on connection
306. Property: RESTRICT prevents deletion of referenced rows
307. Property: CASCADE deletes dependent rows
308. Property: all required indices exist after schema creation
309. Property: prepared statements prevent SQL injection
310. Property: dates stored as ISO 8601 TEXT
311. Property: booleans stored as INTEGER 0/1
312. Property: window calculations use SQLite date functions
313. Property: NULL returned when no completions exist
314. Property: series deletion cascades correctly
315. Property: RESTRICT checked before CASCADE
316. Property: SQLite errors mapped to domain errors
317. Property: schema version tracked
318. Property: migrations run in order

---

## Phase 3: Invariant Infrastructure

### 3.1 Invariant Checker Functions
319. Implement `invariants.dateIsValid`
320. Implement `invariants.timeIsValid`
321. Implement `invariants.dateTimeIsValid`
322. Implement `invariants.durationIsPositive`
323. Implement `invariants.transactionIsolation`
324. Implement `invariants.lockedSeriesNotModified`
325. Implement `invariants.completionEndAfterStart`
326. Implement `invariants.cyclingIndexInBounds`
327. Implement `invariants.chainDepthWithinLimit`
328. Implement `invariants.chainNoCycles`
329. Implement `invariants.withinMinutesOnlyForMustBeWithin`
330. Implement `invariants.withinMinutesNonNegative`
331. Implement `invariants.allDayExcludedFromReflow`
332. Implement `invariants.fixedItemsNotMoved`
333. Implement `invariants.timezoneConsistency`

### 3.2 Invariant Test Harness
334. Create `assertAllInvariants(adapter, planner)` function
335. Create invariant violation reporter with detailed context
336. Integrate invariant checking into property test framework
337. Add CI configuration for invariant checking on every test

---

## Phase 4: State Machine Testing

### 4.1 State Machine Model
338. Define `SystemState` type with all entity maps
339. Define `Operation` union type (18 operation types)
340. Implement `emptyState()` factory
341. Implement `applyOperation(op, state)` — pure state transformer
342. Implement `statesEquivalent(model, real)` — comparison function

### 4.2 Operation Generators
343. Implement `genCreateSeries` — always valid
344. Implement `genUpdateSeries` — requires existing series
345. Implement `genDeleteSeries` — requires deletable series
346. Implement `genLockSeries` — requires existing series
347. Implement `genUnlockSeries` — requires existing series
348. Implement `genSplitSeries` — requires existing unlocked series
349. Implement `genLogCompletion` — requires existing series with valid instance
350. Implement `genDeleteCompletion` — requires existing completion
351. Implement `genLinkSeries` — requires two series, no cycle
352. Implement `genUnlinkSeries` — requires linked child
353. Implement `genAddConstraint` — always valid
354. Implement `genRemoveConstraint` — requires existing constraint
355. Implement `genCancelInstance` — requires valid instance
356. Implement `genRescheduleInstance` — requires non-cancelled instance
357. Implement `genRestoreInstance` — requires cancelled instance
358. Implement `genValidOperation(state)` — picks valid operation for current state

### 4.3 State Machine Tests
359. Property: random operation sequences maintain model-implementation equivalence
360. Property: random operation sequences preserve all invariants
361. Property: error conditions match expected errors for state
362. Test: lock → update → unlock sequence
363. Test: link → complete parent → verify child shift
364. Test: split → completions stay with original
365. Test: constraint → delete series → constraint no-op
366. Test: deep chain creation then parent reschedule
367. Test: cycling advancement across pattern deactivation
368. Test: completion window edge cases

---

## Phase 5: Constraint Satisfaction Fuzzing

### 5.1 Solvable/Unsolvable Generators
369. Implement `genSolvableSchedule` — no overlapping fixed, no contradictions
370. Implement `genUnsolvableSchedule` — known contradictions
371. Implement `genBarelySolvableSchedule` — tight but satisfiable constraints
372. Implement `genHighlyConstrainedSchedule` — many constraints, still solvable

### 5.2 Reflow Stress Tests
373. Property: solvable inputs produce solution with no errors
374. Property: unsolvable inputs report conflicts
375. Test: 100 series stress test
376. Test: 150 series stress test
377. Test: maximum depth chain (32 levels)
378. Test: wide chain (1 parent, 31 children)
379. Test: constraint network (overlapping constraints)
380. Test: all constraint types combined
381. Test: performance under fuzz load (benchmark)

### 5.3 Edge Case Reflow Tests
382. Test: flexible items with no valid slots
383. Test: chain spanning midnight
384. Test: chain spanning DST transition
385. Test: constraint between all-day and timed items
386. Test: concurrent chains with shared constraints

---

## Phase 6: Shrinking Strategies

### 6.1 Custom Shrinkers
387. Implement `shrinkers.dateRange` — halve, shrink by one day
388. Implement `shrinkers.seriesArray` — remove one, halve
389. Implement `shrinkers.pattern` — simplify pattern type, reduce parameters
390. Implement `shrinkers.condition` — flatten tree, reduce thresholds
391. Implement `shrinkers.operationSequence` — remove ops, keep creates + last
392. Implement `shrinkers.constraintSet` — remove constraints one by one
393. Implement `shrinkers.linkChain` — shorten chain

### 6.2 Shrinking Integration
394. Register custom shrinkers with fast-check
395. Test shrinking produces minimal failing cases
396. Add shrinking test for each complex generator

---

---

## Summary

| Phase | Task Count |
|-------|------------|
| Phase 1: Foundation | 58 |
| Phase 2: Property Tests | 260 |
| Phase 3: Invariant Infrastructure | 19 |
| Phase 4: State Machine Testing | 30 |
| Phase 5: Constraint Satisfaction | 18 |
| Phase 6: Shrinking Strategies | 10 |
| **Total** | **395** |
