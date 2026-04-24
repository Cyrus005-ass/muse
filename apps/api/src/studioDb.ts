import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";

export type CreatorSubmissionStatus =
  | "UPLOADED"
  | "QC"
  | "DROITS"
  | "VISA_HAAC"
  | "PROGRAMME"
  | "PUBLIE"
  | "NEED_RESUBMIT"
  | "QUARANTAINE";

export type QcStatus = "PENDING" | "PASSED" | "FAILED";
export type HaacStatus = "DRAFT" | "QUARANTAINE" | "VISA_OK" | "REJETE_HAAC" | "+16" | "+18";

export type CreatorSubmissionRecord = {
  id: number;
  userId: string | null;
  title: string;
  filePath: string;
  posterPath: string | null;
  synopsis: string;
  originalLang: string;
  allowAiDub: boolean;
  rightsFilePath: string | null;
  status: CreatorSubmissionStatus;
  adminNote: string | null;
  contentId: string;
  createdAt: string;
};

export type ContentComplianceRecord = {
  id: string;
  originalLang: string;
  aiDubLangs: string[];
  rightsJson: string | null;
  qcStatus: QcStatus;
  haacStatus: HaacStatus;
  revsharePct: number;
  posterPath: string | null;
  hlsPath: string | null;
  subtitlesPath: string | null;
  allowAiDub: boolean;
  creatorId: string | null;
  title: string;
};

export type ContentFlagRecord = {
  id: number;
  contentId: string;
  flagType: string;
  severity: number;
  aiConfidence: number;
  evidence: string | null;
  detectedAt: string;
};

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function addColumnIfMissing(db: Database.Database, table: string, column: string, ddl: string) {
  if (hasColumn(db, table, column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

function safeJsonArray(input: string | null | undefined): string[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v) => typeof v === "string");
  } catch {
    return [];
  }
}

export function createStudioDatabase(dbPathRaw: string) {
  const dbPath = resolve(dbPathRaw);
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS contents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      creator_id TEXT,
      poster_path TEXT,
      hls_path TEXT,
      subtitles_path TEXT,
      allow_ai_dub INTEGER NOT NULL DEFAULT 0,
      views_payantes INTEGER NOT NULL DEFAULT 0,
      ppv_price REAL NOT NULL DEFAULT 0,
      paid INTEGER NOT NULL DEFAULT 0,
      original_lang TEXT DEFAULT 'fr',
      ai_dub_langs TEXT DEFAULT '[]',
      rights_json TEXT,
      qc_status TEXT DEFAULT 'PENDING',
      haac_status TEXT DEFAULT 'DRAFT',
      revshare_pct REAL DEFAULT 70.0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      title TEXT NOT NULL,
      file_path TEXT NOT NULL,
      poster_path TEXT,
      synopsis TEXT NOT NULL,
      original_lang TEXT DEFAULT 'fr',
      allow_ai_dub INTEGER NOT NULL DEFAULT 0,
      rights_file_path TEXT,
      status TEXT NOT NULL DEFAULT 'UPLOADED',
      admin_note TEXT,
      content_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS content_flags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id TEXT NOT NULL,
      flag_type TEXT NOT NULL,
      severity INTEGER NOT NULL,
      ai_confidence REAL NOT NULL,
      evidence TEXT,
      detected_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
    CREATE INDEX IF NOT EXISTS idx_flags_content ON content_flags(content_id);
    CREATE INDEX IF NOT EXISTS idx_contents_haac ON contents(haac_status);
  `);

  addColumnIfMissing(db, "contents", "original_lang", "original_lang TEXT DEFAULT 'fr'");
  addColumnIfMissing(db, "contents", "ai_dub_langs", "ai_dub_langs TEXT DEFAULT '[]'");
  addColumnIfMissing(db, "contents", "rights_json", "rights_json TEXT");
  addColumnIfMissing(db, "contents", "qc_status", "qc_status TEXT DEFAULT 'PENDING'");
  addColumnIfMissing(db, "contents", "haac_status", "haac_status TEXT DEFAULT 'DRAFT'");
  addColumnIfMissing(db, "contents", "revshare_pct", "revshare_pct REAL DEFAULT 70.0");
  addColumnIfMissing(db, "contents", "poster_path", "poster_path TEXT");
  addColumnIfMissing(db, "contents", "hls_path", "hls_path TEXT");
  addColumnIfMissing(db, "contents", "subtitles_path", "subtitles_path TEXT");
  addColumnIfMissing(db, "contents", "allow_ai_dub", "allow_ai_dub INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "contents", "views_payantes", "views_payantes INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "contents", "ppv_price", "ppv_price REAL NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "contents", "paid", "paid INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "contents", "creator_id", "creator_id TEXT");

  const insertSubmissionStmt = db.prepare(`
    INSERT INTO submissions (user_id, title, file_path, poster_path, synopsis, original_lang, allow_ai_dub, rights_file_path, status, admin_note, content_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const getSubmissionStmt = db.prepare(`
    SELECT id, user_id, title, file_path, poster_path, synopsis, original_lang, allow_ai_dub, rights_file_path, status, admin_note, content_id, created_at
    FROM submissions
    WHERE id = ?
  `);

  const listSubmissionsStmt = db.prepare(`
    SELECT id, user_id, title, file_path, poster_path, synopsis, original_lang, allow_ai_dub, rights_file_path, status, admin_note, content_id, created_at
    FROM submissions
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const listSubmissionsByStatusStmt = db.prepare(`
    SELECT id, user_id, title, file_path, poster_path, synopsis, original_lang, allow_ai_dub, rights_file_path, status, admin_note, content_id, created_at
    FROM submissions
    WHERE status = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const updateSubmissionStatusStmt = db.prepare(`
    UPDATE submissions
    SET status = ?, admin_note = ?
    WHERE id = ?
  `);

  const upsertContentStmt = db.prepare(`
    INSERT INTO contents (id, title, creator_id, poster_path, hls_path, subtitles_path, allow_ai_dub, original_lang, ai_dub_langs, rights_json, qc_status, haac_status, revshare_pct, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      creator_id = excluded.creator_id,
      poster_path = excluded.poster_path,
      hls_path = excluded.hls_path,
      subtitles_path = excluded.subtitles_path,
      allow_ai_dub = excluded.allow_ai_dub,
      original_lang = excluded.original_lang,
      ai_dub_langs = excluded.ai_dub_langs,
      rights_json = excluded.rights_json,
      qc_status = excluded.qc_status,
      haac_status = excluded.haac_status,
      revshare_pct = excluded.revshare_pct,
      updated_at = datetime('now')
  `);

  const getContentStmt = db.prepare(`
    SELECT id, title, creator_id, poster_path, hls_path, subtitles_path, allow_ai_dub, original_lang, ai_dub_langs, rights_json, qc_status, haac_status, revshare_pct
    FROM contents
    WHERE id = ?
  `);

  const updateContentFieldStmt = db.prepare(`
    UPDATE contents
    SET qc_status = COALESCE(?, qc_status),
        haac_status = COALESCE(?, haac_status),
        subtitles_path = COALESCE(?, subtitles_path),
        hls_path = COALESCE(?, hls_path),
        rights_json = COALESCE(?, rights_json),
        updated_at = datetime('now')
    WHERE id = ?
  `);

  const appendDubLangStmt = db.prepare(`
    UPDATE contents
    SET ai_dub_langs = ?, updated_at = datetime('now')
    WHERE id = ?
  `);

  const listHaacQueueStmt = db.prepare(`
    SELECT id, title, creator_id, poster_path, hls_path, subtitles_path, allow_ai_dub, original_lang, ai_dub_langs, rights_json, qc_status, haac_status, revshare_pct
    FROM contents
    WHERE haac_status IN ('QUARANTAINE', 'REJETE_HAAC', '+16', '+18', 'DRAFT')
    ORDER BY updated_at DESC
    LIMIT ?
  `);

  const listContentsStmt = db.prepare(`
    SELECT id, title, creator_id, poster_path, hls_path, subtitles_path, allow_ai_dub, original_lang, ai_dub_langs, rights_json, qc_status, haac_status, revshare_pct
    FROM contents
    ORDER BY updated_at DESC
    LIMIT ?
  `);

  const insertFlagStmt = db.prepare(`
    INSERT INTO content_flags (content_id, flag_type, severity, ai_confidence, evidence)
    VALUES (?, ?, ?, ?, ?)
  `);

  const listFlagsStmt = db.prepare(`
    SELECT id, content_id, flag_type, severity, ai_confidence, evidence, detected_at
    FROM content_flags
    WHERE content_id = ?
    ORDER BY detected_at DESC
  `);

  const clearFlagsStmt = db.prepare(`DELETE FROM content_flags WHERE content_id = ?`);

  const revenueStmt = db.prepare(`
    SELECT creator_id, SUM(views_payantes * ppv_price * (revshare_pct / 100.0)) AS due_amount
    FROM contents
    WHERE paid = 0 AND creator_id IS NOT NULL
    GROUP BY creator_id
  `);

  const markPaidStmt = db.prepare(`UPDATE contents SET paid = 1 WHERE creator_id = ?`);

  function mapSubmission(row: any): CreatorSubmissionRecord {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      filePath: row.file_path,
      posterPath: row.poster_path,
      synopsis: row.synopsis,
      originalLang: row.original_lang,
      allowAiDub: Boolean(row.allow_ai_dub),
      rightsFilePath: row.rights_file_path,
      status: row.status,
      adminNote: row.admin_note,
      contentId: row.content_id,
      createdAt: row.created_at
    };
  }

  function mapContent(row: any): ContentComplianceRecord {
    return {
      id: row.id,
      title: row.title,
      creatorId: row.creator_id,
      posterPath: row.poster_path,
      hlsPath: row.hls_path,
      subtitlesPath: row.subtitles_path,
      allowAiDub: Boolean(row.allow_ai_dub),
      originalLang: row.original_lang ?? "fr",
      aiDubLangs: safeJsonArray(row.ai_dub_langs),
      rightsJson: row.rights_json,
      qcStatus: (row.qc_status ?? "PENDING") as QcStatus,
      haacStatus: (row.haac_status ?? "DRAFT") as HaacStatus,
      revsharePct: Number(row.revshare_pct ?? 70)
    };
  }

  return {
    close() {
      db.close();
    },
    createSubmission(input: {
      userId?: string | null;
      title: string;
      filePath: string;
      posterPath?: string | null;
      synopsis: string;
      originalLang: string;
      allowAiDub: boolean;
      rightsFilePath?: string | null;
      adminNote?: string | null;
      contentId: string;
    }): CreatorSubmissionRecord {
      insertSubmissionStmt.run(
        input.userId ?? null,
        input.title,
        input.filePath,
        input.posterPath ?? null,
        input.synopsis,
        input.originalLang,
        input.allowAiDub ? 1 : 0,
        input.rightsFilePath ?? null,
        "UPLOADED",
        input.adminNote ?? null,
        input.contentId
      );

      const idRow = db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number };
      const row = getSubmissionStmt.get(idRow.id);
      return mapSubmission(row);
    },
    getSubmissionById(id: number): CreatorSubmissionRecord | null {
      const row = getSubmissionStmt.get(id);
      return row ? mapSubmission(row) : null;
    },
    listSubmissions(limit = 100, status?: string): CreatorSubmissionRecord[] {
      const safe = Math.max(1, Math.min(500, Math.trunc(limit)));
      const rows = status
        ? listSubmissionsByStatusStmt.all(status, safe)
        : listSubmissionsStmt.all(safe);
      return rows.map(mapSubmission);
    },
    updateSubmissionStatus(id: number, status: CreatorSubmissionStatus, adminNote?: string | null): CreatorSubmissionRecord | null {
      updateSubmissionStatusStmt.run(status, adminNote ?? null, id);
      const row = getSubmissionStmt.get(id);
      return row ? mapSubmission(row) : null;
    },
    upsertContent(input: {
      id: string;
      title: string;
      creatorId?: string | null;
      posterPath?: string | null;
      hlsPath?: string | null;
      subtitlesPath?: string | null;
      allowAiDub: boolean;
      originalLang: string;
      aiDubLangs?: string[];
      rightsJson?: string | null;
      qcStatus?: QcStatus;
      haacStatus?: HaacStatus;
      revsharePct?: number;
    }): ContentComplianceRecord {
      upsertContentStmt.run(
        input.id,
        input.title,
        input.creatorId ?? null,
        input.posterPath ?? null,
        input.hlsPath ?? null,
        input.subtitlesPath ?? null,
        input.allowAiDub ? 1 : 0,
        input.originalLang,
        JSON.stringify(input.aiDubLangs ?? []),
        input.rightsJson ?? null,
        input.qcStatus ?? "PENDING",
        input.haacStatus ?? "DRAFT",
        input.revsharePct ?? 70
      );
      const row = getContentStmt.get(input.id);
      return mapContent(row);
    },
    getContent(id: string): ContentComplianceRecord | null {
      const row = getContentStmt.get(id);
      return row ? mapContent(row) : null;
    },
    listContents(limit = 200): ContentComplianceRecord[] {
      const safe = Math.max(1, Math.min(500, Math.trunc(limit)));
      const rows = listContentsStmt.all(safe);
      return rows.map(mapContent);
    },
    listHaacQueue(limit = 200): ContentComplianceRecord[] {
      const safe = Math.max(1, Math.min(500, Math.trunc(limit)));
      const rows = listHaacQueueStmt.all(safe);
      return rows.map(mapContent);
    },
    updateContentCompliance(input: {
      id: string;
      qcStatus?: QcStatus | null;
      haacStatus?: HaacStatus | null;
      subtitlesPath?: string | null;
      hlsPath?: string | null;
      rightsJson?: string | null;
    }): ContentComplianceRecord | null {
      updateContentFieldStmt.run(
        input.qcStatus ?? null,
        input.haacStatus ?? null,
        input.subtitlesPath ?? null,
        input.hlsPath ?? null,
        input.rightsJson ?? null,
        input.id
      );

      const row = getContentStmt.get(input.id);
      return row ? mapContent(row) : null;
    },
    appendAiDubLang(contentId: string, lang: string): ContentComplianceRecord | null {
      const current = this.getContent(contentId);
      if (!current) return null;
      const next = Array.from(new Set([...current.aiDubLangs, lang]));
      appendDubLangStmt.run(JSON.stringify(next), contentId);
      const row = getContentStmt.get(contentId);
      return row ? mapContent(row) : null;
    },
    clearFlags(contentId: string): void {
      clearFlagsStmt.run(contentId);
    },
    addFlag(input: {
      contentId: string;
      flagType: string;
      severity: number;
      aiConfidence: number;
      evidence?: string | null;
    }): ContentFlagRecord {
      insertFlagStmt.run(input.contentId, input.flagType, input.severity, input.aiConfidence, input.evidence ?? null);
      const row = db.prepare(`SELECT id, content_id, flag_type, severity, ai_confidence, evidence, detected_at FROM content_flags WHERE id = last_insert_rowid()`).get() as any;
      return {
        id: row.id,
        contentId: row.content_id,
        flagType: row.flag_type,
        severity: row.severity,
        aiConfidence: row.ai_confidence,
        evidence: row.evidence,
        detectedAt: row.detected_at
      };
    },
    listFlags(contentId: string): ContentFlagRecord[] {
      const rows = listFlagsStmt.all(contentId) as any[];
      return rows.map((row) => ({
        id: row.id,
        contentId: row.content_id,
        flagType: row.flag_type,
        severity: row.severity,
        aiConfidence: row.ai_confidence,
        evidence: row.evidence,
        detectedAt: row.detected_at
      }));
    },
    getRevenuePending(): Array<{ creatorId: string; dueAmount: number }> {
      const rows = revenueStmt.all() as Array<{ creator_id: string; due_amount: number | null }>;
      return rows.map((row) => ({
        creatorId: row.creator_id,
        dueAmount: Number((row.due_amount ?? 0).toFixed(2))
      }));
    },
    markCreatorPaid(creatorId: string): void {
      markPaidStmt.run(creatorId);
    },
    appendAdminAudit(input: {
      id: string;
      actorUserId?: string | null;
      actorEmail: string;
      action: string;
      entityType: string;
      entityId: string;
      payloadJson?: string | null;
    }): void {
      db.prepare(`
        INSERT INTO admin_audit_logs (id, actor_user_id, actor_email, action, entity_type, entity_id, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.id,
        input.actorUserId ?? null,
        input.actorEmail,
        input.action,
        input.entityType,
        input.entityId,
        input.payloadJson ?? null
      );
    }
  };
}
