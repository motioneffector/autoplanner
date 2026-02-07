/**
 * SQLite Adapter
 *
 * Production implementation of the autoplanner adapter using better-sqlite3.
 * 15 tables, FK enforcement (CASCADE/RESTRICT), indices, error mapping.
 */
import Database from 'better-sqlite3'

// ============================================================================
// Error Classes
// ============================================================================

export class DuplicateKeyError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'DuplicateKeyError'
  }
}

export class ForeignKeyError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ForeignKeyError'
  }
}

export class InvalidDataError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'InvalidDataError'
  }
}

export class NotFoundError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'NotFoundError'
  }
}

// ============================================================================
// Adapter Type
// ============================================================================

export type SqliteAdapter = {
  listTables(): Promise<string[]>
  getTableColumns(table: string): Promise<string[]>
  listIndices(table: string): Promise<string[]>
  pragma(name: string): Promise<any>
  execute(sql: string): Promise<void>
  rawQuery(sql: string): Promise<any[]>
  explainQueryPlan(sql: string): Promise<string>

  getTransactionType(): Promise<string | null>
  inTransaction(): Promise<boolean>
  transaction<T>(fn: () => Promise<T>): Promise<T>

  saveSeries(s: any): Promise<void>
  getSeries(id: any): Promise<any | null>
  getSeriesOrThrow(id: any): Promise<any>
  getAllSeries(): Promise<any[]>
  updateSeries(s: any): Promise<void>
  deleteSeries(id: any): Promise<void>

  savePattern(p: any): Promise<void>
  getPatternsBySeries(seriesId: any): Promise<any[]>
  savePatternWeekday(pw: any): Promise<void>
  getPatternWeekdays(patternId: any): Promise<any[]>

  saveCondition(c: any): Promise<void>
  getConditionsBySeries(seriesId: any): Promise<any[]>

  saveCompletion(c: any): Promise<void>
  getCompletion(id: any): Promise<any | null>
  countCompletionsInWindow(seriesId: any, start: any, end: any): Promise<number>
  daysSinceLastCompletion(seriesId: any, asOf: any): Promise<number | null>

  saveReminder(r: any): Promise<void>
  getReminder(id: any): Promise<any | null>
  saveReminderAck(ack: any): Promise<void>
  getReminderAcks(reminderId: any): Promise<any[]>

  saveLink(l: any): Promise<void>
  getLink(id: any): Promise<any | null>

  saveException(e: any): Promise<void>
  getException(seriesId: any, instanceDate: any): Promise<any | null>

  saveAdaptiveDuration(ad: any): Promise<void>
  getAdaptiveDuration(seriesId: any): Promise<any | null>

  saveCyclingConfig(cc: any): Promise<void>
  getCyclingConfig(seriesId: any): Promise<any | null>
  saveCyclingItem(ci: any): Promise<void>
  getCyclingItems(seriesId: any): Promise<any[]>

  saveSeriesTag(st: any): Promise<void>
  getSeriesTags(seriesId: any): Promise<string[]>

  getSchemaVersion(): Promise<number>
  getMigrationHistory(): Promise<{ version: number; appliedAt: string }[]>
  applyMigration(migration: {
    version: number
    up: () => Promise<void>
    down: () => Promise<void>
  }): Promise<void>

  close(): Promise<void>
}

// ============================================================================
// Schema DDL
// ============================================================================

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS series (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    locked INTEGER NOT NULL DEFAULT 0,
    start_date TEXT,
    end_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS condition (
    id TEXT PRIMARY KEY,
    series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    parent_id TEXT REFERENCES condition(id) ON DELETE CASCADE,
    series_ref TEXT,
    window_days INTEGER,
    comparison TEXT,
    value REAL,
    days TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_condition_series ON condition(series_id);
  CREATE INDEX IF NOT EXISTS idx_condition_parent ON condition(parent_id);

  CREATE TABLE IF NOT EXISTS pattern (
    id TEXT PRIMARY KEY,
    series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    time TEXT,
    condition_id TEXT REFERENCES condition(id) ON DELETE SET NULL,
    n INTEGER,
    day INTEGER,
    month INTEGER,
    weekday INTEGER,
    allday INTEGER,
    duration INTEGER,
    fixed INTEGER,
    CHECK (type IN (
      'daily','everyNDays','weekly','everyNWeeks',
      'monthly','lastDayOfMonth','yearly',
      'weekdays','weekdaysOnly','weekendsOnly',
      'nthWeekdayOfMonth','lastWeekdayOfMonth','nthToLastWeekdayOfMonth'
    ))
  );
  CREATE INDEX IF NOT EXISTS idx_pattern_series ON pattern(series_id);
  CREATE INDEX IF NOT EXISTS idx_pattern_condition ON pattern(condition_id);

  CREATE TABLE IF NOT EXISTS pattern_weekday (
    pattern_id TEXT NOT NULL REFERENCES pattern(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL,
    PRIMARY KEY (pattern_id, day_of_week)
  );

  CREATE TABLE IF NOT EXISTS completion (
    id TEXT PRIMARY KEY,
    series_id TEXT NOT NULL REFERENCES series(id) ON DELETE RESTRICT,
    instance_date TEXT NOT NULL,
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_completion_series ON completion(series_id);
  CREATE INDEX IF NOT EXISTS idx_completion_date ON completion(date);
  CREATE INDEX IF NOT EXISTS idx_completion_instance ON completion(series_id, instance_date);

  CREATE TABLE IF NOT EXISTS reminder (
    id TEXT PRIMARY KEY,
    series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    offset INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_reminder_series ON reminder(series_id);

  CREATE TABLE IF NOT EXISTS reminder_ack (
    reminder_id TEXT NOT NULL REFERENCES reminder(id) ON DELETE CASCADE,
    instance_date TEXT NOT NULL,
    acknowledged_at TEXT NOT NULL,
    PRIMARY KEY (reminder_id, instance_date)
  );
  CREATE INDEX IF NOT EXISTS idx_reminder_ack_time ON reminder_ack(acknowledged_at);

  CREATE TABLE IF NOT EXISTS link (
    id TEXT PRIMARY KEY,
    parent_id TEXT NOT NULL REFERENCES series(id) ON DELETE RESTRICT,
    child_id TEXT NOT NULL UNIQUE REFERENCES series(id) ON DELETE CASCADE,
    distance INTEGER NOT NULL,
    early_wobble INTEGER,
    late_wobble INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_link_parent ON link(parent_id);

  CREATE TABLE IF NOT EXISTS "constraint" (
    id TEXT PRIMARY KEY,
    type TEXT,
    source_type TEXT,
    source_value TEXT,
    dest_type TEXT,
    dest_value TEXT,
    within_minutes INTEGER
  );

  CREATE TABLE IF NOT EXISTS instance_exception (
    series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    instance_date TEXT NOT NULL,
    type TEXT NOT NULL,
    PRIMARY KEY (series_id, instance_date)
  );

  CREATE TABLE IF NOT EXISTS adaptive_duration (
    series_id TEXT PRIMARY KEY REFERENCES series(id) ON DELETE CASCADE,
    mode TEXT NOT NULL,
    last_n INTEGER,
    fallback INTEGER,
    multiplier REAL
  );

  CREATE TABLE IF NOT EXISTS cycling_config (
    series_id TEXT PRIMARY KEY REFERENCES series(id) ON DELETE CASCADE,
    mode TEXT NOT NULL,
    current_index INTEGER NOT NULL DEFAULT 0,
    gap_leap INTEGER
  );

  CREATE TABLE IF NOT EXISTS cycling_item (
    series_id TEXT NOT NULL REFERENCES cycling_config(series_id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (series_id, idx)
  );

  CREATE TABLE IF NOT EXISTS series_tag (
    series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    PRIMARY KEY (series_id, tag)
  );

  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
`

// ============================================================================
// Error Mapping
// ============================================================================

function mapError(e: unknown): never {
  const msg = (e as Error)?.message ?? String(e)
  if (/UNIQUE constraint/i.test(msg)) {
    throw new DuplicateKeyError(msg, { cause: e })
  }
  if (/FOREIGN KEY constraint/i.test(msg)) {
    throw new ForeignKeyError(msg, { cause: e })
  }
  if (/CHECK constraint/i.test(msg)) {
    throw new InvalidDataError(msg, { cause: e })
  }
  throw e
}

function safe<T>(fn: () => T): T {
  try {
    return fn()
  } catch (e) {
    mapError(e)
  }
}

// ============================================================================
// Row → Domain Mappers
// ============================================================================

function toSeries(row: any) {
  return {
    id: row.id,
    title: row.title,
    locked: row.locked === 1,
    ...(row.start_date != null ? { startDate: row.start_date } : {}),
    ...(row.end_date != null ? { endDate: row.end_date } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toPattern(row: any) {
  return {
    id: row.id,
    seriesId: row.series_id,
    type: row.type,
    ...(row.time != null ? { time: row.time } : {}),
    ...(row.condition_id != null ? { conditionId: row.condition_id } : {}),
    ...(row.n != null ? { n: row.n } : {}),
    ...(row.day != null ? { day: row.day } : {}),
    ...(row.month != null ? { month: row.month } : {}),
    ...(row.weekday != null ? { weekday: row.weekday } : {}),
    ...(row.allday != null ? { allDay: row.allday === 1 } : {}),
    ...(row.duration != null ? { duration: row.duration } : {}),
    ...(row.fixed != null ? { fixed: row.fixed === 1 } : {}),
  }
}

function toCompletion(row: any) {
  return {
    id: row.id,
    seriesId: row.series_id,
    instanceDate: row.instance_date,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
  }
}

// ============================================================================
// Factory
// ============================================================================

export async function createSqliteAdapter(path: string): Promise<SqliteAdapter> {
  const db = new Database(path)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(SCHEMA_SQL)

  // Seed initial schema version if empty
  const ver = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as any
  if (ver?.v == null) {
    db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
      1,
      new Date().toISOString(),
    )
  }

  let _inTx = false
  let _txType: string | null = null

  function saveConditionNode(seriesId: string, condition: any, parentId: string | null): string {
    const id = crypto.randomUUID()
    db.prepare(
      'INSERT INTO condition (id, series_id, type, parent_id, series_ref, window_days, comparison, value, days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      id, seriesId, condition.type, parentId,
      condition.seriesRef ?? null, condition.windowDays ?? null,
      condition.comparison ?? null, condition.value ?? null,
      condition.days ? JSON.stringify(condition.days) : null,
    )

    if (condition.type === 'and' || condition.type === 'or') {
      for (const child of condition.conditions || []) {
        saveConditionNode(seriesId, child, id)
      }
    } else if (condition.type === 'not' && condition.condition) {
      saveConditionNode(seriesId, condition.condition, id)
    }

    return id
  }

  function reconstructConditionTree(
    condId: string,
    conditionsById: Map<string, any>,
    childrenByParent: Map<string, any[]>,
  ): any {
    const cond = conditionsById.get(condId)
    if (!cond) return null

    const result: any = { type: cond.type }

    if (cond.type === 'completionCount') {
      if (cond.seriesRef != null) result.seriesRef = cond.seriesRef
      if (cond.windowDays != null) result.windowDays = cond.windowDays
      if (cond.comparison != null) result.comparison = cond.comparison
      if (cond.value != null) result.value = cond.value
    } else if (cond.type === 'and' || cond.type === 'or') {
      const children = childrenByParent.get(cond.id) || []
      result.conditions = children.map((c: any) =>
        reconstructConditionTree(c.id, conditionsById, childrenByParent),
      )
    } else if (cond.type === 'not') {
      const children = childrenByParent.get(cond.id) || []
      if (children.length > 0) {
        result.condition = reconstructConditionTree(children[0].id, conditionsById, childrenByParent)
      }
    } else if (cond.type === 'weekday') {
      if (cond.days) result.days = cond.days
    }

    return result
  }

  function reconstructFullSeries(seriesId: string): any {
    const row = db.prepare('SELECT * FROM series WHERE id = ?').get(seriesId) as any
    if (!row) return null

    const result: any = toSeries(row)

    // Load all conditions for tree reconstruction
    const condRows = db.prepare('SELECT * FROM condition WHERE series_id = ?').all(seriesId) as any[]
    const conditionsById = new Map<string, any>()
    const childrenByParent = new Map<string, any[]>()
    for (const c of condRows) {
      const cond: any = {
        id: c.id,
        type: c.type,
        ...(c.series_ref != null ? { seriesRef: c.series_ref } : {}),
        ...(c.window_days != null ? { windowDays: c.window_days } : {}),
        ...(c.comparison != null ? { comparison: c.comparison } : {}),
        ...(c.value != null ? { value: c.value } : {}),
        ...(c.days != null ? { days: JSON.parse(c.days) } : {}),
      }
      conditionsById.set(c.id, cond)
      if (c.parent_id) {
        if (!childrenByParent.has(c.parent_id)) childrenByParent.set(c.parent_id, [])
        childrenByParent.get(c.parent_id)!.push(cond)
      }
    }

    // Patterns
    const patternRows = db.prepare('SELECT * FROM pattern WHERE series_id = ?').all(seriesId) as any[]
    const patterns: any[] = []
    for (const pr of patternRows) {
      const p: any = toPattern(pr)
      delete p.id
      delete p.seriesId
      delete p.conditionId

      // Weekdays
      const weekdayRows = db
        .prepare('SELECT day_of_week FROM pattern_weekday WHERE pattern_id = ? ORDER BY day_of_week')
        .all(pr.id) as any[]
      if (weekdayRows.length > 0) {
        p.days = weekdayRows.map((r: any) => r.day_of_week)
      }

      // Condition tree
      if (pr.condition_id && conditionsById.has(pr.condition_id)) {
        p.condition = reconstructConditionTree(pr.condition_id, conditionsById, childrenByParent)
      }

      patterns.push(p)
    }
    result.patterns = patterns

    // Tags
    const tagRows = db.prepare('SELECT tag FROM series_tag WHERE series_id = ?').all(seriesId) as any[]
    if (tagRows.length > 0) {
      result.tags = tagRows.map((r: any) => r.tag)
    }

    // Cycling
    const cyclingRow = db.prepare('SELECT * FROM cycling_config WHERE series_id = ?').get(seriesId) as any
    if (cyclingRow) {
      const cycling: any = {
        mode: cyclingRow.mode,
        currentIndex: cyclingRow.current_index,
      }
      if (cyclingRow.gap_leap != null) cycling.gapLeap = cyclingRow.gap_leap === 1
      const itemRows = db
        .prepare('SELECT value FROM cycling_item WHERE series_id = ? ORDER BY idx')
        .all(seriesId) as any[]
      if (itemRows.length > 0) {
        cycling.items = itemRows.map((r: any) => r.value)
      }
      result.cycling = cycling
    }

    // Adaptive duration
    const adRow = db.prepare('SELECT * FROM adaptive_duration WHERE series_id = ?').get(seriesId) as any
    if (adRow) {
      result.adaptiveDuration = {
        mode: adRow.mode,
        ...(adRow.last_n != null ? { lastN: adRow.last_n } : {}),
        ...(adRow.fallback != null ? { fallback: adRow.fallback } : {}),
        ...(adRow.multiplier != null ? { multiplier: adRow.multiplier } : {}),
      }
    }

    return result
  }

  const adapter: SqliteAdapter = {
    // ---- Schema inspection ----

    async listTables() {
      const rows = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .all() as { name: string }[]
      return rows.map((r) => r.name)
    },

    async getTableColumns(table) {
      const rows = db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]
      return rows.map((r) => r.name)
    },

    async listIndices(table) {
      const rows = db.prepare(`PRAGMA index_list("${table}")`).all() as { name: string }[]
      return rows.map((r) => r.name)
    },

    async pragma(name) {
      const row = db.prepare(`PRAGMA ${name}`).get() as Record<string, any> | null
      return row ? Object.values(row)[0] : null
    },

    async execute(sql) {
      safe(() => db.exec(sql))
    },

    async rawQuery(sql) {
      return db.prepare(sql).all()
    },

    async explainQueryPlan(sql) {
      const rows = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as { detail: string }[]
      return rows.map((r) => r.detail).join('\n')
    },

    // ---- Transaction ----

    async getTransactionType() {
      return _txType
    },

    async inTransaction() {
      return _inTx
    },

    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      if (_inTx) return await fn()

      _inTx = true
      _txType = 'IMMEDIATE'
      db.exec('BEGIN IMMEDIATE')
      try {
        const result = await fn()
        db.exec('COMMIT')
        return result
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      } finally {
        _inTx = false
        _txType = null
      }
    },

    // ---- Series ----

    async saveSeries(s) {
      safe(() => {
        const run = db.transaction(() => {
          const existing = db.prepare('SELECT id FROM series WHERE id = ?').get(s.id)
          if (existing) {
            db.prepare(
              'UPDATE series SET title = ?, locked = ?, start_date = ?, end_date = ?, updated_at = ? WHERE id = ?',
            ).run(s.title, s.locked ? 1 : 0, s.startDate ?? null, s.endDate ?? null, s.updatedAt, s.id)
            db.prepare('DELETE FROM condition WHERE series_id = ?').run(s.id)
            db.prepare('DELETE FROM pattern WHERE series_id = ?').run(s.id)
            db.prepare('DELETE FROM series_tag WHERE series_id = ?').run(s.id)
            db.prepare('DELETE FROM cycling_config WHERE series_id = ?').run(s.id)
            db.prepare('DELETE FROM adaptive_duration WHERE series_id = ?').run(s.id)
          } else {
            db.prepare(
              'INSERT INTO series (id, title, locked, start_date, end_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            ).run(s.id, s.title, s.locked ? 1 : 0, s.startDate ?? null, s.endDate ?? null, s.createdAt, s.updatedAt)
          }

          // Patterns
          if (s.patterns && Array.isArray(s.patterns)) {
            for (const p of s.patterns) {
              const pid = crypto.randomUUID()
              let condId: string | null = null
              if (p.condition) {
                condId = saveConditionNode(s.id, p.condition, null)
              }
              db.prepare(
                'INSERT INTO pattern (id, series_id, type, time, condition_id, n, day, month, weekday, allday, duration, fixed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              ).run(
                pid, s.id, p.type, p.time ?? null, condId,
                p.n ?? null, p.day ?? null, p.month ?? null, p.weekday ?? null,
                p.allDay != null ? (p.allDay ? 1 : 0) : null,
                p.duration ?? null,
                p.fixed != null ? (p.fixed ? 1 : 0) : null,
              )
              if (p.days && Array.isArray(p.days)) {
                for (const dow of p.days) {
                  db.prepare('INSERT INTO pattern_weekday (pattern_id, day_of_week) VALUES (?, ?)').run(pid, dow)
                }
              }
            }
          }

          // Tags
          if (s.tags && Array.isArray(s.tags)) {
            for (const tag of s.tags) {
              db.prepare('INSERT INTO series_tag (series_id, tag) VALUES (?, ?)').run(s.id, tag)
            }
          }

          // Cycling
          if (s.cycling) {
            db.prepare(
              'INSERT INTO cycling_config (series_id, mode, current_index, gap_leap) VALUES (?, ?, ?, ?)',
            ).run(s.id, s.cycling.mode, s.cycling.currentIndex ?? 0, s.cycling.gapLeap != null ? (s.cycling.gapLeap ? 1 : 0) : null)
            if (s.cycling.items && Array.isArray(s.cycling.items)) {
              for (let i = 0; i < s.cycling.items.length; i++) {
                db.prepare('INSERT INTO cycling_item (series_id, idx, value) VALUES (?, ?, ?)').run(
                  s.id, i, s.cycling.items[i],
                )
              }
            }
          }

          // Adaptive duration
          if (s.adaptiveDuration) {
            db.prepare(
              'INSERT INTO adaptive_duration (series_id, mode, last_n, fallback, multiplier) VALUES (?, ?, ?, ?, ?)',
            ).run(
              s.id, s.adaptiveDuration.mode, s.adaptiveDuration.lastN ?? null,
              s.adaptiveDuration.fallback ?? null, s.adaptiveDuration.multiplier ?? null,
            )
          }
        })
        run()
      })
    },

    async getSeries(id) {
      return reconstructFullSeries(id)
    },

    async getSeriesOrThrow(id) {
      const s = reconstructFullSeries(id)
      if (!s) throw new NotFoundError(`Series not found: ${id}`)
      return s
    },

    async getAllSeries() {
      const rows = db.prepare('SELECT id FROM series ORDER BY id').all() as any[]
      return rows.map((r: any) => reconstructFullSeries(r.id)).filter(Boolean)
    },

    async updateSeries(s) {
      safe(() =>
        db
          .prepare('UPDATE series SET title = ?, locked = ?, start_date = ?, end_date = ?, updated_at = ? WHERE id = ?')
          .run(s.title, s.locked ? 1 : 0, s.startDate ?? null, s.endDate ?? null, s.updatedAt, s.id),
      )
    },

    async deleteSeries(id) {
      safe(() => db.prepare('DELETE FROM series WHERE id = ?').run(id))
    },

    // ---- Pattern ----

    async savePattern(p) {
      safe(() =>
        db
          .prepare(
            'INSERT INTO pattern (id, series_id, type, time, condition_id, n, day, month, weekday, allday, duration, fixed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            p.id, p.seriesId, p.type, p.time ?? null, p.conditionId ?? null,
            p.n ?? null, p.day ?? null, p.month ?? null, p.weekday ?? null,
            p.allDay != null ? (p.allDay ? 1 : 0) : null,
            p.duration ?? null,
            p.fixed != null ? (p.fixed ? 1 : 0) : null,
          ),
      )
    },

    async getPatternsBySeries(seriesId) {
      const rows = db.prepare('SELECT * FROM pattern WHERE series_id = ?').all(seriesId) as any[]
      return rows.map(toPattern)
    },

    async savePatternWeekday(pw) {
      safe(() =>
        db
          .prepare('INSERT INTO pattern_weekday (pattern_id, day_of_week) VALUES (?, ?)')
          .run(pw.patternId, pw.dayOfWeek),
      )
    },

    async getPatternWeekdays(patternId) {
      const rows = db
        .prepare('SELECT * FROM pattern_weekday WHERE pattern_id = ?')
        .all(patternId) as any[]
      return rows.map((r) => ({ patternId: r.pattern_id, dayOfWeek: r.day_of_week }))
    },

    // ---- Condition ----

    async saveCondition(c) {
      safe(() =>
        db
          .prepare(
            'INSERT INTO condition (id, series_id, type, parent_id, series_ref, window_days, comparison, value, days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            c.id, c.seriesId, c.type, c.parentId ?? null,
            c.seriesRef ?? null, c.windowDays ?? null,
            c.comparison ?? null, c.value ?? null,
            c.days ? JSON.stringify(c.days) : null,
          ),
      )
    },

    async getConditionsBySeries(seriesId) {
      const rows = db.prepare('SELECT * FROM condition WHERE series_id = ?').all(seriesId) as any[]
      return rows.map((r) => ({
        id: r.id,
        seriesId: r.series_id,
        type: r.type,
        ...(r.parent_id != null ? { parentId: r.parent_id } : {}),
        ...(r.series_ref != null ? { seriesRef: r.series_ref } : {}),
        ...(r.window_days != null ? { windowDays: r.window_days } : {}),
        ...(r.comparison != null ? { comparison: r.comparison } : {}),
        ...(r.value != null ? { value: r.value } : {}),
        ...(r.days != null ? { days: JSON.parse(r.days) } : {}),
      }))
    },

    // ---- Completion ----

    async saveCompletion(c) {
      safe(() =>
        db
          .prepare(
            'INSERT INTO completion (id, series_id, instance_date, date, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)',
          )
          .run(c.id, c.seriesId, c.instanceDate, c.date, c.startTime, c.endTime),
      )
    },

    async getCompletion(id) {
      const row = db.prepare('SELECT * FROM completion WHERE id = ?').get(id) as any
      return row ? toCompletion(row) : null
    },

    async countCompletionsInWindow(seriesId, start, end) {
      const row = db
        .prepare(
          'SELECT COUNT(*) as cnt FROM completion WHERE series_id = ? AND instance_date >= ? AND instance_date <= ?',
        )
        .get(seriesId, start, end) as { cnt: number }
      return row.cnt
    },

    async daysSinceLastCompletion(seriesId, asOf) {
      const row = db
        .prepare(
          'SELECT CAST(julianday(?) - julianday(MAX(start_time)) AS INTEGER) as days FROM completion WHERE series_id = ?',
        )
        .get(asOf, seriesId) as { days: number | null }
      return row?.days ?? null
    },

    // ---- Reminder ----

    async saveReminder(r) {
      safe(() =>
        db
          .prepare('INSERT INTO reminder (id, series_id, type, offset) VALUES (?, ?, ?, ?)')
          .run(r.id, r.seriesId, r.type, r.offset),
      )
    },

    async getReminder(id) {
      const row = db.prepare('SELECT * FROM reminder WHERE id = ?').get(id) as any
      if (!row) return null
      return { id: row.id, seriesId: row.series_id, type: row.type, offset: row.offset }
    },

    async saveReminderAck(ack) {
      safe(() =>
        db
          .prepare(
            'INSERT INTO reminder_ack (reminder_id, instance_date, acknowledged_at) VALUES (?, ?, ?)',
          )
          .run(ack.reminderId, ack.instanceDate, ack.acknowledgedAt),
      )
    },

    async getReminderAcks(reminderId) {
      const rows = db
        .prepare('SELECT * FROM reminder_ack WHERE reminder_id = ?')
        .all(reminderId) as any[]
      return rows.map((r) => ({
        reminderId: r.reminder_id,
        instanceDate: r.instance_date,
        acknowledgedAt: r.acknowledged_at,
      }))
    },

    // ---- Link ----

    async saveLink(l) {
      safe(() =>
        db
          .prepare('INSERT INTO link (id, parent_id, child_id, distance, early_wobble, late_wobble) VALUES (?, ?, ?, ?, ?, ?)')
          .run(l.id ?? crypto.randomUUID(), l.parentId, l.childId, l.distance, l.earlyWobble ?? null, l.lateWobble ?? null),
      )
    },

    async getLink(id) {
      const row = db.prepare('SELECT * FROM link WHERE id = ?').get(id) as any
      if (!row) return null
      return {
        id: row.id,
        parentId: row.parent_id,
        childId: row.child_id,
        distance: row.distance,
        ...(row.early_wobble != null ? { earlyWobble: row.early_wobble } : {}),
        ...(row.late_wobble != null ? { lateWobble: row.late_wobble } : {}),
      }
    },

    // ---- Exception ----

    async saveException(e) {
      safe(() =>
        db
          .prepare(
            'INSERT INTO instance_exception (series_id, instance_date, type) VALUES (?, ?, ?)',
          )
          .run(e.seriesId, e.instanceDate, e.type),
      )
    },

    async getException(seriesId, instanceDate) {
      const row = db
        .prepare('SELECT * FROM instance_exception WHERE series_id = ? AND instance_date = ?')
        .get(seriesId, instanceDate) as any
      if (!row) return null
      return { seriesId: row.series_id, instanceDate: row.instance_date, type: row.type }
    },

    // ---- Adaptive Duration ----

    async saveAdaptiveDuration(ad) {
      safe(() =>
        db
          .prepare(
            'INSERT OR REPLACE INTO adaptive_duration (series_id, mode, last_n, fallback, multiplier) VALUES (?, ?, ?, ?, ?)',
          )
          .run(ad.seriesId, ad.mode, ad.lastN ?? null, ad.fallback ?? null, ad.multiplier ?? null),
      )
    },

    async getAdaptiveDuration(seriesId) {
      const row = db
        .prepare('SELECT * FROM adaptive_duration WHERE series_id = ?')
        .get(seriesId) as any
      if (!row) return null
      return {
        seriesId: row.series_id,
        mode: row.mode,
        ...(row.last_n != null ? { lastN: row.last_n } : {}),
        ...(row.fallback != null ? { fallback: row.fallback } : {}),
        ...(row.multiplier != null ? { multiplier: row.multiplier } : {}),
      }
    },

    // ---- Cycling ----

    async saveCyclingConfig(cc) {
      safe(() =>
        db
          .prepare(
            'INSERT OR REPLACE INTO cycling_config (series_id, mode, current_index, gap_leap) VALUES (?, ?, ?, ?)',
          )
          .run(cc.seriesId, cc.mode, cc.currentIndex ?? 0, cc.gapLeap != null ? (cc.gapLeap ? 1 : 0) : null),
      )
    },

    async getCyclingConfig(seriesId) {
      const row = db
        .prepare('SELECT * FROM cycling_config WHERE series_id = ?')
        .get(seriesId) as any
      if (!row) return null
      return {
        seriesId: row.series_id,
        mode: row.mode,
        currentIndex: row.current_index,
        ...(row.gap_leap != null ? { gapLeap: row.gap_leap === 1 } : {}),
      }
    },

    async saveCyclingItem(ci) {
      safe(() =>
        db
          .prepare('INSERT INTO cycling_item (series_id, idx, value) VALUES (?, ?, ?)')
          .run(ci.seriesId, ci.index, ci.value),
      )
    },

    async getCyclingItems(seriesId) {
      const rows = db
        .prepare('SELECT * FROM cycling_item WHERE series_id = ? ORDER BY idx')
        .all(seriesId) as any[]
      return rows.map((r) => ({ seriesId: r.series_id, index: r.idx, value: r.value }))
    },

    // ---- Tags ----

    async saveSeriesTag(st) {
      safe(() =>
        db.prepare('INSERT INTO series_tag (series_id, tag) VALUES (?, ?)').run(st.seriesId, st.tag),
      )
    },

    async getSeriesTags(seriesId) {
      const rows = db
        .prepare('SELECT tag FROM series_tag WHERE series_id = ?')
        .all(seriesId) as { tag: string }[]
      return rows.map((r) => r.tag)
    },

    // ---- Migration ----

    async getSchemaVersion() {
      const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number }
      return row.v
    },

    async getMigrationHistory() {
      const rows = db
        .prepare('SELECT version, applied_at FROM schema_version ORDER BY version ASC')
        .all() as any[]
      return rows.map((r) => ({ version: r.version, appliedAt: r.applied_at }))
    },

    async applyMigration(migration) {
      await adapter.transaction(async () => {
        await migration.up()
        db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
          migration.version,
          new Date().toISOString(),
        )
      })
    },

    // ---- Lifecycle ----

    async close() {
      db.close()
    },
  }

  return adapter
}
