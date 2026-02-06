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
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS condition (
    id TEXT PRIMARY KEY,
    series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    parent_id TEXT REFERENCES condition(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_condition_series ON condition(series_id);
  CREATE INDEX IF NOT EXISTS idx_condition_parent ON condition(parent_id);

  CREATE TABLE IF NOT EXISTS pattern (
    id TEXT PRIMARY KEY,
    series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    time TEXT,
    condition_id TEXT REFERENCES condition(id) ON DELETE SET NULL,
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
    distance INTEGER NOT NULL
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
    last_n INTEGER
  );

  CREATE TABLE IF NOT EXISTS cycling_config (
    series_id TEXT PRIMARY KEY REFERENCES series(id) ON DELETE CASCADE,
    mode TEXT NOT NULL,
    current_index INTEGER NOT NULL DEFAULT 0
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toPattern(row: any) {
  return {
    id: row.id,
    seriesId: row.series_id,
    type: row.type,
    time: row.time,
    ...(row.condition_id != null ? { conditionId: row.condition_id } : {}),
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
      safe(() =>
        db
          .prepare('INSERT INTO series (id, title, locked, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
          .run(s.id, s.title, s.locked ? 1 : 0, s.createdAt, s.updatedAt),
      )
    },

    async getSeries(id) {
      const row = db.prepare('SELECT * FROM series WHERE id = ?').get(id) as any
      return row ? toSeries(row) : null
    },

    async getSeriesOrThrow(id) {
      const s = await adapter.getSeries(id)
      if (!s) throw new NotFoundError(`Series not found: ${id}`)
      return s
    },

    async getAllSeries() {
      const rows = db.prepare('SELECT * FROM series ORDER BY id').all() as any[]
      return rows.map(toSeries)
    },

    async updateSeries(s) {
      safe(() =>
        db
          .prepare('UPDATE series SET title = ?, locked = ?, updated_at = ? WHERE id = ?')
          .run(s.title, s.locked ? 1 : 0, s.updatedAt, s.id),
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
            'INSERT INTO pattern (id, series_id, type, time, condition_id) VALUES (?, ?, ?, ?, ?)',
          )
          .run(p.id, p.seriesId, p.type, p.time ?? null, p.conditionId ?? null),
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
          .prepare('INSERT INTO condition (id, series_id, type, parent_id) VALUES (?, ?, ?, ?)')
          .run(c.id, c.seriesId, c.type, c.parentId ?? null),
      )
    },

    async getConditionsBySeries(seriesId) {
      const rows = db.prepare('SELECT * FROM condition WHERE series_id = ?').all(seriesId) as any[]
      return rows.map((r) => ({
        id: r.id,
        seriesId: r.series_id,
        type: r.type,
        ...(r.parent_id != null ? { parentId: r.parent_id } : {}),
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
          .prepare('INSERT INTO link (id, parent_id, child_id, distance) VALUES (?, ?, ?, ?)')
          .run(l.id, l.parentId, l.childId, l.distance),
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
            'INSERT OR REPLACE INTO adaptive_duration (series_id, mode, last_n) VALUES (?, ?, ?)',
          )
          .run(ad.seriesId, ad.mode, ad.lastN ?? null),
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
      }
    },

    // ---- Cycling ----

    async saveCyclingConfig(cc) {
      safe(() =>
        db
          .prepare(
            'INSERT OR REPLACE INTO cycling_config (series_id, mode, current_index) VALUES (?, ?, ?)',
          )
          .run(cc.seriesId, cc.mode, cc.currentIndex ?? 0),
      )
    },

    async getCyclingConfig(seriesId) {
      const row = db
        .prepare('SELECT * FROM cycling_config WHERE series_id = ?')
        .get(seriesId) as any
      if (!row) return null
      return { seriesId: row.series_id, mode: row.mode, currentIndex: row.current_index }
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
