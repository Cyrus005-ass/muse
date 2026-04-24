-- Studio IA Afrique migration
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

ALTER TABLE contents ADD COLUMN original_lang TEXT DEFAULT 'fr';
ALTER TABLE contents ADD COLUMN ai_dub_langs TEXT DEFAULT '[]';
ALTER TABLE contents ADD COLUMN rights_json TEXT;
ALTER TABLE contents ADD COLUMN qc_status TEXT DEFAULT 'PENDING';
ALTER TABLE contents ADD COLUMN haac_status TEXT DEFAULT 'DRAFT';
ALTER TABLE contents ADD COLUMN revshare_pct REAL DEFAULT 70.0;

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY,
  user_id INT,
  title TEXT,
  file_path TEXT,
  poster_path TEXT,
  synopsis TEXT,
  original_lang TEXT,
  allow_ai_dub BOOLEAN,
  rights_file_path TEXT,
  status TEXT DEFAULT 'UPLOADED',
  admin_note TEXT,
  content_id TEXT,
  created_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS content_flags (
  id INTEGER PRIMARY KEY,
  content_id INT,
  flag_type TEXT,
  severity INT,
  ai_confidence REAL,
  evidence TEXT,
  detected_at TEXT DEFAULT (datetime('now'))
);
