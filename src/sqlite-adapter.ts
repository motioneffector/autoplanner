/**
 * SQLite Adapter
 *
 * Production implementation of the autoplanner adapter using better-sqlite3.
 * Implements the canonical Adapter interface with normalized CRUD operations.
 */
import Database from 'better-sqlite3'
import type {
  Adapter, Series, Pattern, Condition, Completion,
  InstanceException, AdaptiveDurationConfig, CyclingConfig, CyclingItem,
  Reminder, ReminderAck, RelationalConstraint, Link, Tag,
  LocalDate, LocalDateTime,
} from './adapter'
import { DuplicateKeyError, ForeignKeyError, InvalidDataError, NotFoundError } from './adapter'

// Re-export errors for backwards compatibility
export { DuplicateKeyError, ForeignKeyError, InvalidDataError, NotFoundError }

// ============================================================================
// Extended type for SQLite-specific introspection methods
// ============================================================================

export type SqliteExtras = {
  listTables(): Promise<string[]>
  getTableColumns(table: string): Promise<string[]>
  listIndices(table: string): Promise<string[]>
  pragma(name: string): Promise<any>
  execute(sql: string): Promise<void>
  rawQuery(sql: string): Promise<any[]>
  explainQueryPlan(sql: string): Promise<string>
  getTransactionType(): Promise<string | null>
  inTransaction(): Promise<boolean>
  getSchemaVersion(): Promise<number>
  getMigrationHistory(): Promise<{ version: number; appliedAt: string }[]>
  applyMigration(migration: {
    version: number
    up: () => Promise<void>
    down: () => Promise<void>
  }): Promise<void>
}

export type SqliteAdapter = Adapter & SqliteExtras

// ============================================================================
// Schema DDL
// ============================================================================

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS series (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
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
    operator TEXT,
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
    fixed INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_pattern_series ON pattern(series_id);
  CREATE INDEX IF NOT EXISTS idx_pattern_condition ON pattern(condition_id);

  CREATE TABLE IF NOT EXISTS pattern_weekday (
    pattern_id TEXT NOT NULL REFERENCES pattern(id) ON DELETE CASCADE,
    day_of_week TEXT NOT NULL,
    PRIMARY KEY (pattern_id, day_of_week)
  );

  CREATE TABLE IF NOT EXISTS completion (
    id TEXT PRIMARY KEY,
    series_id TEXT NOT NULL REFERENCES series(id) ON DELETE RESTRICT,
    instance_date TEXT NOT NULL,
    date TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    UNIQUE(series_id, instance_date)
  );
  CREATE INDEX IF NOT EXISTS idx_completion_series ON completion(series_id);
  CREATE INDEX IF NOT EXISTS idx_completion_date ON completion(date);

  CREATE TABLE IF NOT EXISTS reminder (
    id TEXT PRIMARY KEY,
    series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT '',
    minutes_before INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_reminder_series ON reminder(series_id);

  CREATE TABLE IF NOT EXISTS reminder_ack (
    reminder_id TEXT NOT NULL REFERENCES reminder(id) ON DELETE CASCADE,
    instance_date TEXT NOT NULL,
    acknowledged_at TEXT NOT NULL,
    PRIMARY KEY (reminder_id, instance_date)
  );

  CREATE TABLE IF NOT EXISTS link (
    id TEXT PRIMARY KEY,
    parent_series_id TEXT NOT NULL REFERENCES series(id) ON DELETE RESTRICT,
    child_series_id TEXT NOT NULL UNIQUE REFERENCES series(id) ON DELETE CASCADE,
    target_distance INTEGER NOT NULL,
    early_wobble INTEGER NOT NULL DEFAULT 0,
    late_wobble INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_link_parent ON link(parent_series_id);

  CREATE TABLE IF NOT EXISTS relational_constraint (
    id TEXT PRIMARY KEY,
    type TEXT,
    source_type TEXT,
    source_value TEXT,
    dest_type TEXT,
    dest_value TEXT,
    within_minutes INTEGER
  );

  CREATE TABLE IF NOT EXISTS instance_exception (
    id TEXT PRIMARY KEY,
    series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    original_date TEXT NOT NULL,
    type TEXT NOT NULL,
    new_date TEXT,
    UNIQUE(series_id, original_date)
  );

  CREATE TABLE IF NOT EXISTS adaptive_duration (
    series_id TEXT PRIMARY KEY REFERENCES series(id) ON DELETE CASCADE,
    fallback_duration INTEGER NOT NULL DEFAULT 0,
    buffer_percent REAL NOT NULL DEFAULT 0,
    last_n INTEGER NOT NULL DEFAULT 5,
    window_days INTEGER NOT NULL DEFAULT 30
  );

  CREATE TABLE IF NOT EXISTS cycling_config (
    series_id TEXT PRIMARY KEY REFERENCES series(id) ON DELETE CASCADE,
    mode TEXT,
    current_index INTEGER NOT NULL DEFAULT 0,
    gap_leap INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS cycling_item (
    series_id TEXT NOT NULL REFERENCES cycling_config(series_id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    duration INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (series_id, position)
  );

  CREATE TABLE IF NOT EXISTS tag (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS series_tag (
    series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
    PRIMARY KEY (series_id, tag_id)
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
  if (/UNIQUE constraint/i.test(msg)) throw new DuplicateKeyError(msg)
  if (/FOREIGN KEY constraint/i.test(msg)) throw new ForeignKeyError(msg)
  if (/CHECK constraint/i.test(msg)) throw new InvalidDataError(msg)
  throw e
}

function safe<T>(fn: () => T): T {
  try { return fn() }
  catch (e) { mapError(e) }
}

// ============================================================================
// Row → Domain Mappers
// ============================================================================

function toSeries(row: any): Series {
  return {
    id: row.id,
    title: row.title,
    ...(row.description != null ? { description: row.description } : {}),
    locked: row.locked === 1,
    ...(row.start_date != null ? { startDate: row.start_date } : {}),
    ...(row.end_date != null ? { endDate: row.end_date } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } as Series
}

function toPattern(row: any): Pattern {
  return {
    id: row.id,
    seriesId: row.series_id,
    type: row.type,
    conditionId: row.condition_id ?? null,
    ...(row.time != null ? { time: row.time } : {}),
    ...(row.n != null ? { n: row.n } : {}),
    ...(row.day != null ? { day: row.day } : {}),
    ...(row.month != null ? { month: row.month } : {}),
    ...(row.weekday != null ? { weekday: row.weekday } : {}),
    ...(row.allday != null ? { allDay: row.allday === 1 } : {}),
    ...(row.duration != null ? { duration: row.duration } : {}),
    ...(row.fixed != null ? { fixed: row.fixed === 1 } : {}),
  } as Pattern
}

function toCondition(row: any): Condition {
  return {
    id: row.id,
    seriesId: row.series_id,
    parentId: row.parent_id ?? null,
    type: row.type,
    ...(row.operator != null ? { operator: row.operator } : {}),
    ...(row.series_ref != null ? { seriesRef: row.series_ref } : {}),
    ...(row.window_days != null ? { windowDays: row.window_days } : {}),
    ...(row.comparison != null ? { comparison: row.comparison } : {}),
    ...(row.value != null ? { value: row.value } : {}),
    ...(row.days != null ? { days: JSON.parse(row.days) } : {}),
  } as Condition
}

function toCompletion(row: any): Completion {
  return {
    id: row.id,
    seriesId: row.series_id,
    instanceDate: row.instance_date,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
  }
}

function toException(row: any): InstanceException {
  return {
    id: row.id,
    seriesId: row.series_id,
    originalDate: row.original_date,
    type: row.type,
    ...(row.new_date != null ? { newDate: row.new_date } : {}),
  } as InstanceException
}

function toReminder(row: any): Reminder {
  return {
    id: row.id,
    seriesId: row.series_id,
    minutesBefore: row.minutes_before,
    label: row.label,
  }
}

function toLink(row: any): Link {
  return {
    id: row.id,
    parentSeriesId: row.parent_series_id,
    childSeriesId: row.child_series_id,
    targetDistance: row.target_distance,
    earlyWobble: row.early_wobble,
    lateWobble: row.late_wobble,
  }
}

function toConstraint(row: any): RelationalConstraint {
  const sourceTarget = row.source_type === 'tag'
    ? { tag: row.source_value }
    : { seriesId: row.source_value }
  const destinationTarget = row.dest_type === 'tag'
    ? { tag: row.dest_value }
    : { seriesId: row.dest_value }
  return {
    id: row.id,
    type: row.type,
    sourceTarget,
    destinationTarget,
    ...(row.within_minutes != null ? { withinMinutes: row.within_minutes } : {}),
  } as RelationalConstraint
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
      1, new Date().toISOString(),
    )
  }

  let _inTx = false
  let _txType: string | null = null

  function durationMinutes(start: string, end: string): number {
    const startDate = new Date(start)
    const endDate = new Date(end)
    return Math.round((endDate.getTime() - startDate.getTime()) / 60000)
  }

  function encodeTarget(target: { tag: string } | { seriesId: string }): { type: string; value: string } {
    if ('tag' in target) return { type: 'tag', value: target.tag }
    return { type: 'series', value: target.seriesId }
  }

  const adapter: SqliteAdapter = {
    // ================================================================
    // Transaction
    // ================================================================
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

    // ================================================================
    // Series
    // ================================================================
    async createSeries(series: Series) {
      safe(() =>
        db.prepare(
          'INSERT INTO series (id, title, description, locked, start_date, end_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ).run(
          series.id,
          series.title,
          (series as any).description ?? null,
          (series as any).locked ? 1 : 0,
          (series as any).startDate ?? null,
          (series as any).endDate ?? null,
          series.createdAt,
          (series as any).updatedAt ?? series.createdAt,
        ),
      )
    },

    async getSeries(id: string) {
      const row = db.prepare('SELECT * FROM series WHERE id = ?').get(id) as any
      return row ? toSeries(row) : null
    },

    async getAllSeries() {
      const rows = db.prepare('SELECT * FROM series ORDER BY id').all() as any[]
      return rows.map(toSeries)
    },

    async getSeriesByTag(tagName: string) {
      const rows = db.prepare(`
        SELECT s.* FROM series s
        JOIN series_tag st ON st.series_id = s.id
        JOIN tag t ON t.id = st.tag_id
        WHERE t.name = ?
      `).all(tagName) as any[]
      return rows.map(toSeries)
    },

    async updateSeries(id: string, changes: Partial<Series>) {
      const existing = db.prepare('SELECT * FROM series WHERE id = ?').get(id) as any
      if (!existing) throw new NotFoundError(`Series '${id}' not found`)
      const merged = { ...toSeries(existing), ...changes }
      safe(() =>
        db.prepare(
          'UPDATE series SET title = ?, description = ?, locked = ?, start_date = ?, end_date = ?, updated_at = ? WHERE id = ?',
        ).run(
          merged.title,
          (merged as any).description ?? null,
          (merged as any).locked ? 1 : 0,
          (merged as any).startDate ?? null,
          (merged as any).endDate ?? null,
          (merged as any).updatedAt ?? new Date().toISOString(),
          id,
        ),
      )
    },

    async deleteSeries(id: string) {
      safe(() => db.prepare('DELETE FROM series WHERE id = ?').run(id))
    },

    // ================================================================
    // Pattern
    // ================================================================
    async createPattern(pattern: Pattern) {
      safe(() =>
        db.prepare(
          'INSERT INTO pattern (id, series_id, type, time, condition_id, n, day, month, weekday, allday, duration, fixed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ).run(
          pattern.id,
          pattern.seriesId,
          pattern.type,
          (pattern as any).time ?? null,
          pattern.conditionId ?? null,
          (pattern as any).n ?? null,
          (pattern as any).day ?? null,
          (pattern as any).month ?? null,
          (pattern as any).weekday ?? null,
          (pattern as any).allDay != null ? ((pattern as any).allDay ? 1 : 0) : null,
          (pattern as any).duration ?? null,
          (pattern as any).fixed != null ? ((pattern as any).fixed ? 1 : 0) : null,
        ),
      )
    },

    async getPattern(id: string) {
      const row = db.prepare('SELECT * FROM pattern WHERE id = ?').get(id) as any
      return row ? toPattern(row) : null
    },

    async getPatternsBySeries(seriesId: string) {
      const rows = db.prepare('SELECT * FROM pattern WHERE series_id = ?').all(seriesId) as any[]
      return rows.map(toPattern)
    },

    async deletePattern(id: string) {
      db.prepare('DELETE FROM pattern WHERE id = ?').run(id)
    },

    // ================================================================
    // Pattern Weekday
    // ================================================================
    async setPatternWeekdays(patternId: string, weekdays: string[]) {
      db.prepare('DELETE FROM pattern_weekday WHERE pattern_id = ?').run(patternId)
      for (const day of weekdays) {
        safe(() =>
          db.prepare('INSERT INTO pattern_weekday (pattern_id, day_of_week) VALUES (?, ?)').run(patternId, String(day)),
        )
      }
    },

    async getPatternWeekdays(patternId: string) {
      const rows = db.prepare('SELECT day_of_week FROM pattern_weekday WHERE pattern_id = ?').all(patternId) as any[]
      return rows.map((r: any) => r.day_of_week)
    },

    async getAllPatternWeekdays() {
      const rows = db.prepare('SELECT pattern_id, day_of_week FROM pattern_weekday').all() as any[]
      return rows.map((r: any) => ({ patternId: r.pattern_id, weekday: r.day_of_week }))
    },

    // ================================================================
    // Condition
    // ================================================================
    async createCondition(condition: Condition) {
      safe(() =>
        db.prepare(
          'INSERT INTO condition (id, series_id, type, parent_id, series_ref, window_days, comparison, operator, value, days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ).run(
          condition.id,
          condition.seriesId,
          condition.type,
          condition.parentId ?? null,
          (condition as any).seriesRef ?? null,
          condition.windowDays ?? null,
          (condition as any).comparison ?? null,
          condition.operator ?? null,
          condition.value ?? null,
          (condition as any).days ? JSON.stringify((condition as any).days) : null,
        ),
      )
    },

    async getCondition(id: string) {
      const row = db.prepare('SELECT * FROM condition WHERE id = ?').get(id) as any
      return row ? toCondition(row) : null
    },

    async getConditionsBySeries(seriesId: string) {
      const rows = db.prepare('SELECT * FROM condition WHERE series_id = ?').all(seriesId) as any[]
      return rows.map(toCondition)
    },

    async updateCondition(id: string, changes: Partial<Condition>) {
      const existing = db.prepare('SELECT * FROM condition WHERE id = ?').get(id) as any
      if (!existing) throw new NotFoundError(`Condition '${id}' not found`)
      const merged = { ...toCondition(existing), ...changes }
      safe(() =>
        db.prepare(
          'UPDATE condition SET type = ?, parent_id = ?, series_ref = ?, window_days = ?, comparison = ?, operator = ?, value = ?, days = ? WHERE id = ?',
        ).run(
          merged.type,
          merged.parentId ?? null,
          (merged as any).seriesRef ?? null,
          merged.windowDays ?? null,
          (merged as any).comparison ?? null,
          merged.operator ?? null,
          merged.value ?? null,
          (merged as any).days ? JSON.stringify((merged as any).days) : null,
          id,
        ),
      )
    },

    async deleteCondition(id: string) {
      db.prepare('DELETE FROM condition WHERE id = ?').run(id)
    },

    // ================================================================
    // Adaptive Duration
    // ================================================================
    async setAdaptiveDuration(seriesId: string, config: AdaptiveDurationConfig | null) {
      if (config === null) {
        db.prepare('DELETE FROM adaptive_duration WHERE series_id = ?').run(seriesId)
      } else {
        safe(() =>
          db.prepare(
            'INSERT OR REPLACE INTO adaptive_duration (series_id, fallback_duration, buffer_percent, last_n, window_days) VALUES (?, ?, ?, ?, ?)',
          ).run(
            seriesId,
            config.fallbackDuration ?? 0,
            config.bufferPercent ?? 0,
            config.lastN ?? 5,
            config.windowDays ?? 30,
          ),
        )
      }
    },

    async getAdaptiveDuration(seriesId: string) {
      const row = db.prepare('SELECT * FROM adaptive_duration WHERE series_id = ?').get(seriesId) as any
      if (!row) return null
      return {
        seriesId: row.series_id,
        fallbackDuration: row.fallback_duration,
        bufferPercent: row.buffer_percent,
        lastN: row.last_n,
        windowDays: row.window_days,
      }
    },

    // ================================================================
    // Cycling Config
    // ================================================================
    async setCyclingConfig(seriesId: string, config: CyclingConfig | null) {
      if (config === null) {
        db.prepare('DELETE FROM cycling_config WHERE series_id = ?').run(seriesId)
      } else {
        safe(() =>
          db.prepare(
            'INSERT OR REPLACE INTO cycling_config (series_id, mode, current_index, gap_leap) VALUES (?, ?, ?, ?)',
          ).run(seriesId, config.mode ?? null, config.currentIndex, config.gapLeap ? 1 : 0),
        )
      }
    },

    async getCyclingConfig(seriesId: string) {
      const row = db.prepare('SELECT * FROM cycling_config WHERE series_id = ?').get(seriesId) as any
      if (!row) return null
      return {
        seriesId: row.series_id,
        mode: row.mode,
        currentIndex: row.current_index,
        gapLeap: row.gap_leap === 1,
      }
    },

    async updateCyclingIndex(seriesId: string, index: number) {
      const existing = db.prepare('SELECT * FROM cycling_config WHERE series_id = ?').get(seriesId) as any
      if (!existing) throw new NotFoundError(`Cycling config for '${seriesId}' not found`)
      db.prepare('UPDATE cycling_config SET current_index = ? WHERE series_id = ?').run(index, seriesId)
    },

    // ================================================================
    // Cycling Items
    // ================================================================
    async setCyclingItems(seriesId: string, items: CyclingItem[]) {
      db.prepare('DELETE FROM cycling_item WHERE series_id = ?').run(seriesId)
      for (const item of items) {
        safe(() =>
          db.prepare('INSERT INTO cycling_item (series_id, position, title, duration) VALUES (?, ?, ?, ?)').run(
            seriesId, item.position, item.title, item.duration,
          ),
        )
      }
    },

    async getCyclingItems(seriesId: string) {
      const rows = db.prepare('SELECT * FROM cycling_item WHERE series_id = ? ORDER BY position').all(seriesId) as any[]
      return rows.map((r: any) => ({
        seriesId: r.series_id,
        position: r.position,
        title: r.title,
        duration: r.duration,
      }))
    },

    // ================================================================
    // Instance Exception
    // ================================================================
    async createInstanceException(exception: InstanceException) {
      safe(() =>
        db.prepare(
          'INSERT INTO instance_exception (id, series_id, original_date, type, new_date) VALUES (?, ?, ?, ?, ?)',
        ).run(
          exception.id,
          exception.seriesId,
          exception.originalDate,
          exception.type,
          exception.newDate ?? null,
        ),
      )
    },

    async getInstanceException(seriesId: string, originalDate: LocalDate) {
      const row = db.prepare(
        'SELECT * FROM instance_exception WHERE series_id = ? AND original_date = ?',
      ).get(seriesId, originalDate) as any
      return row ? toException(row) : null
    },

    async getExceptionsBySeries(seriesId: string) {
      const rows = db.prepare('SELECT * FROM instance_exception WHERE series_id = ?').all(seriesId) as any[]
      return rows.map(toException)
    },

    async getExceptionsInRange(seriesId: string, start: LocalDate, end: LocalDate) {
      const rows = db.prepare(
        'SELECT * FROM instance_exception WHERE series_id = ? AND original_date >= ? AND original_date <= ?',
      ).all(seriesId, start, end) as any[]
      return rows.map(toException)
    },

    async getAllExceptions() {
      const rows = db.prepare('SELECT * FROM instance_exception').all() as any[]
      return rows.map(toException)
    },

    async deleteInstanceException(id: string) {
      db.prepare('DELETE FROM instance_exception WHERE id = ?').run(id)
    },

    // ================================================================
    // Completion
    // ================================================================
    async createCompletion(completion: Completion) {
      safe(() =>
        db.prepare(
          'INSERT INTO completion (id, series_id, instance_date, date, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(
          completion.id, completion.seriesId, completion.instanceDate,
          completion.date, completion.startTime, completion.endTime,
        ),
      )
    },

    async getCompletion(id: string) {
      const row = db.prepare('SELECT * FROM completion WHERE id = ?').get(id) as any
      return row ? toCompletion(row) : null
    },

    async getCompletionsBySeries(seriesId: string) {
      const rows = db.prepare('SELECT * FROM completion WHERE series_id = ?').all(seriesId) as any[]
      return rows.map(toCompletion)
    },

    async getCompletionByInstance(seriesId: string, instanceDate: LocalDate) {
      const row = db.prepare(
        'SELECT * FROM completion WHERE series_id = ? AND instance_date = ?',
      ).get(seriesId, instanceDate) as any
      return row ? toCompletion(row) : null
    },

    async deleteCompletion(id: string) {
      db.prepare('DELETE FROM completion WHERE id = ?').run(id)
    },

    async getAllCompletions() {
      const rows = db.prepare('SELECT * FROM completion').all() as any[]
      return rows.map(toCompletion)
    },

    async countCompletionsInWindow(seriesId: string, start: LocalDate, end: LocalDate) {
      const row = db.prepare(
        'SELECT COUNT(*) as cnt FROM completion WHERE series_id = ? AND instance_date >= ? AND instance_date <= ?',
      ).get(seriesId, start, end) as { cnt: number }
      return row.cnt
    },

    async daysSinceLastCompletion(seriesId: string, asOf: LocalDate) {
      const row = db.prepare(
        'SELECT MAX(date) as last_date FROM completion WHERE series_id = ?',
      ).get(seriesId) as { last_date: string | null }
      if (!row?.last_date) return null
      const lastMs = new Date(row.last_date).getTime()
      const asOfMs = new Date(asOf as string).getTime()
      return Math.round((asOfMs - lastMs) / 86400000)
    },

    async getRecentDurations(
      seriesId: string,
      options: { lastN: number } | { windowDays: number; asOf: LocalDate },
    ) {
      let rows: any[]
      if ('lastN' in options) {
        rows = db.prepare(
          'SELECT start_time, end_time FROM completion WHERE series_id = ? ORDER BY date DESC LIMIT ?',
        ).all(seriesId, options.lastN) as any[]
      } else {
        const asOfMs = new Date(options.asOf as string).getTime()
        const windowStartMs = asOfMs - (options.windowDays - 1) * 86400000
        const windowStart = new Date(windowStartMs).toISOString().slice(0, 10)
        rows = db.prepare(
          'SELECT start_time, end_time FROM completion WHERE series_id = ? AND date >= ? AND date <= ? ORDER BY date DESC',
        ).all(seriesId, windowStart, options.asOf) as any[]
      }
      return rows.map((r: any) => durationMinutes(r.start_time, r.end_time))
    },

    // ================================================================
    // Tag
    // ================================================================
    async createTag(name: string) {
      const existing = db.prepare('SELECT id FROM tag WHERE name = ?').get(name) as any
      if (existing) return existing.id
      const id = crypto.randomUUID()
      safe(() => db.prepare('INSERT INTO tag (id, name) VALUES (?, ?)').run(id, name))
      return id
    },

    async getTagByName(name: string) {
      const row = db.prepare('SELECT * FROM tag WHERE name = ?').get(name) as any
      return row ? { id: row.id, name: row.name } : null
    },

    async addTagToSeries(seriesId: string, tagName: string) {
      let tagId: string
      const existing = db.prepare('SELECT id FROM tag WHERE name = ?').get(tagName) as any
      if (existing) {
        tagId = existing.id
      } else {
        tagId = crypto.randomUUID()
        db.prepare('INSERT INTO tag (id, name) VALUES (?, ?)').run(tagId, tagName)
      }
      db.prepare('INSERT OR IGNORE INTO series_tag (series_id, tag_id) VALUES (?, ?)').run(seriesId, tagId)
    },

    async removeTagFromSeries(seriesId: string, tagName: string) {
      const tag = db.prepare('SELECT id FROM tag WHERE name = ?').get(tagName) as any
      if (!tag) return
      db.prepare('DELETE FROM series_tag WHERE series_id = ? AND tag_id = ?').run(seriesId, tag.id)
    },

    async getTagsForSeries(seriesId: string) {
      const rows = db.prepare(`
        SELECT t.* FROM tag t
        JOIN series_tag st ON st.tag_id = t.id
        WHERE st.series_id = ?
      `).all(seriesId) as any[]
      return rows.map((r: any) => ({ id: r.id, name: r.name }))
    },

    async getAllSeriesTags() {
      const rows = db.prepare('SELECT series_id, tag_id FROM series_tag').all() as any[]
      return rows.map((r: any) => ({ seriesId: r.series_id, tagId: r.tag_id }))
    },

    async deleteTag(id: string) {
      db.prepare('DELETE FROM tag WHERE id = ?').run(id)
    },

    // ================================================================
    // Reminder
    // ================================================================
    async createReminder(reminder: Reminder) {
      safe(() =>
        db.prepare('INSERT INTO reminder (id, series_id, label, minutes_before) VALUES (?, ?, ?, ?)').run(
          reminder.id, reminder.seriesId, reminder.label, reminder.minutesBefore,
        ),
      )
    },

    async getReminder(id: string) {
      const row = db.prepare('SELECT * FROM reminder WHERE id = ?').get(id) as any
      return row ? toReminder(row) : null
    },

    async getRemindersBySeries(seriesId: string) {
      const rows = db.prepare('SELECT * FROM reminder WHERE series_id = ?').all(seriesId) as any[]
      return rows.map(toReminder)
    },

    async getAllReminders() {
      const rows = db.prepare('SELECT * FROM reminder').all() as any[]
      return rows.map(toReminder)
    },

    async updateReminder(id: string, changes: Partial<Reminder>) {
      const existing = db.prepare('SELECT * FROM reminder WHERE id = ?').get(id) as any
      if (!existing) throw new NotFoundError(`Reminder '${id}' not found`)
      const merged = { ...toReminder(existing), ...changes }
      db.prepare('UPDATE reminder SET label = ?, minutes_before = ? WHERE id = ?').run(
        merged.label, merged.minutesBefore, id,
      )
    },

    async deleteReminder(id: string) {
      db.prepare('DELETE FROM reminder WHERE id = ?').run(id)
    },

    // ================================================================
    // Reminder Acknowledgment
    // ================================================================
    async acknowledgeReminder(reminderId: string, instanceDate: LocalDate, acknowledgedAt: LocalDateTime) {
      safe(() =>
        db.prepare(
          'INSERT INTO reminder_ack (reminder_id, instance_date, acknowledged_at) VALUES (?, ?, ?)',
        ).run(reminderId, instanceDate, acknowledgedAt),
      )
    },

    async isReminderAcknowledged(reminderId: string, instanceDate: LocalDate) {
      const row = db.prepare(
        'SELECT 1 FROM reminder_ack WHERE reminder_id = ? AND instance_date = ?',
      ).get(reminderId, instanceDate) as any
      return !!row
    },

    async getReminderAcksInRange(start: LocalDate, end: LocalDate) {
      const rows = db.prepare(
        'SELECT * FROM reminder_ack WHERE instance_date >= ? AND instance_date <= ?',
      ).all(start, end) as any[]
      return rows.map((r: any) => ({
        reminderId: r.reminder_id,
        instanceDate: r.instance_date,
        acknowledgedAt: r.acknowledged_at,
      }))
    },

    async purgeOldReminderAcks(olderThan: LocalDate) {
      db.prepare('DELETE FROM reminder_ack WHERE instance_date < ?').run(olderThan)
    },

    // ================================================================
    // Relational Constraint
    // ================================================================
    async createRelationalConstraint(constraint: RelationalConstraint) {
      const src = encodeTarget(constraint.sourceTarget)
      const dst = encodeTarget(constraint.destinationTarget)
      safe(() =>
        db.prepare(
          'INSERT INTO relational_constraint (id, type, source_type, source_value, dest_type, dest_value, within_minutes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run(
          constraint.id,
          constraint.type,
          src.type, src.value,
          dst.type, dst.value,
          (constraint as any).withinMinutes ?? null,
        ),
      )
    },

    async getRelationalConstraint(id: string) {
      const row = db.prepare('SELECT * FROM relational_constraint WHERE id = ?').get(id) as any
      return row ? toConstraint(row) : null
    },

    async getAllRelationalConstraints() {
      const rows = db.prepare('SELECT * FROM relational_constraint').all() as any[]
      return rows.map(toConstraint)
    },

    async deleteRelationalConstraint(id: string) {
      db.prepare('DELETE FROM relational_constraint WHERE id = ?').run(id)
    },

    // ================================================================
    // Link
    // ================================================================
    async createLink(link: Link) {
      if (link.parentSeriesId === link.childSeriesId) {
        throw new InvalidDataError('Cannot link a series to itself')
      }
      safe(() =>
        db.prepare(
          'INSERT INTO link (id, parent_series_id, child_series_id, target_distance, early_wobble, late_wobble) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(
          link.id,
          link.parentSeriesId,
          link.childSeriesId,
          link.targetDistance,
          link.earlyWobble,
          link.lateWobble,
        ),
      )
    },

    async getLink(id: string) {
      const row = db.prepare('SELECT * FROM link WHERE id = ?').get(id) as any
      return row ? toLink(row) : null
    },

    async getLinkByChild(childSeriesId: string) {
      const row = db.prepare('SELECT * FROM link WHERE child_series_id = ?').get(childSeriesId) as any
      return row ? toLink(row) : null
    },

    async getLinksByParent(parentSeriesId: string) {
      const rows = db.prepare('SELECT * FROM link WHERE parent_series_id = ?').all(parentSeriesId) as any[]
      return rows.map(toLink)
    },

    async getAllLinks() {
      const rows = db.prepare('SELECT * FROM link').all() as any[]
      return rows.map(toLink)
    },

    async updateLink(id: string, changes: Partial<Link>) {
      const existing = db.prepare('SELECT * FROM link WHERE id = ?').get(id) as any
      if (!existing) throw new NotFoundError(`Link '${id}' not found`)
      const merged = { ...toLink(existing), ...changes }
      db.prepare(
        'UPDATE link SET parent_series_id = ?, child_series_id = ?, target_distance = ?, early_wobble = ?, late_wobble = ? WHERE id = ?',
      ).run(merged.parentSeriesId, merged.childSeriesId, merged.targetDistance, merged.earlyWobble, merged.lateWobble, id)
    },

    async deleteLink(id: string) {
      db.prepare('DELETE FROM link WHERE id = ?').run(id)
    },

    // ================================================================
    // Lifecycle
    // ================================================================
    async close() {
      db.close()
    },

    // ================================================================
    // SQLite Extras (introspection, migration, etc.)
    // ================================================================
    async listTables() {
      const rows = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      ).all() as { name: string }[]
      return rows.map((r) => r.name)
    },

    async getTableColumns(table: string) {
      const rows = db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]
      return rows.map((r) => r.name)
    },

    async listIndices(table: string) {
      const rows = db.prepare(`PRAGMA index_list("${table}")`).all() as { name: string }[]
      return rows.map((r) => r.name)
    },

    async pragma(name: string) {
      const row = db.prepare(`PRAGMA ${name}`).get() as Record<string, any> | null
      return row ? Object.values(row)[0] : null
    },

    async execute(sql: string) {
      safe(() => db.exec(sql))
    },

    async rawQuery(sql: string) {
      return db.prepare(sql).all()
    },

    async explainQueryPlan(sql: string) {
      const rows = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as { detail: string }[]
      return rows.map((r) => r.detail).join('\n')
    },

    async getTransactionType() {
      return _txType
    },

    async inTransaction() {
      return _inTx
    },

    async getSchemaVersion() {
      const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number }
      return row.v
    },

    async getMigrationHistory() {
      const rows = db.prepare('SELECT version, applied_at FROM schema_version ORDER BY version ASC').all() as any[]
      return rows.map((r) => ({ version: r.version, appliedAt: r.applied_at }))
    },

    async applyMigration(migration) {
      await adapter.transaction(async () => {
        await migration.up()
        db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
          migration.version, new Date().toISOString(),
        )
      })
    },
  }

  return adapter
}
