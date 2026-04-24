import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";

export type UserRole = "user" | "admin";
export type SubscriptionPlan = "monthly" | "yearly";
export type SubscriptionStatus = "active" | "canceled";
export type BillingPaymentMethod = "card" | "mobile_money" | "paypal";
export type BillingTransactionStatus = "paid" | "failed";

export type MessageStatus = "new" | "reviewed" | "contacted" | "archived";
export type FeedbackStatus = "new" | "reviewed" | "featured" | "archived";
export type SubmissionStatus = "submitted" | "under_review" | "approved" | "rejected" | "published";

export type UserRecord = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
};

export type SubscriptionRecord = {
  userId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  startedAt: string;
  renewAt: string | null;
  canceledAt: string | null;
};

export type BillingTransactionRecord = {
  id: string;
  receiptCode: string;
  userId: string;
  plan: SubscriptionPlan;
  amountCents: number;
  currency: string;
  paymentMethod: BillingPaymentMethod;
  status: BillingTransactionStatus;
  createdAt: string;
};

export type CollaboratorMessageRecord = {
  id: string;
  name: string;
  email: string;
  organization: string | null;
  interestArea: string | null;
  message: string;
  status: MessageStatus;
  createdAt: string;
  updatedAt: string;
};

export type FeedbackRecord = {
  id: string;
  name: string;
  email: string | null;
  rating: number;
  comment: string;
  status: FeedbackStatus;
  createdAt: string;
  updatedAt: string;
};

export type SubmissionRecord = {
  id: string;
  creatorName: string;
  creatorEmail: string;
  title: string;
  type: string;
  synopsis: string;
  pitch: string;
  status: SubmissionStatus;
  publishedCatalogId: string | null;
  createdAt: string;
  updatedAt: string;
};
export type AdminAuditRecord = {
  id: string;
  actorUserId: string | null;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  payloadJson: string | null;
  createdAt: string;
};

export type BillingHistoryFilters = {
  limit?: number;
  status?: BillingTransactionStatus;
  plan?: SubscriptionPlan;
};

type DbUserRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
};

type DbSubscriptionRow = {
  user_id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  started_at: string;
  renew_at: string | null;
  canceled_at: string | null;
};

type DbBillingRow = {
  id: string;
  user_id: string;
  plan: SubscriptionPlan;
  amount_cents: number;
  currency: string;
  payment_method: BillingPaymentMethod;
  status: BillingTransactionStatus;
  created_at: string;
};

type DbMessageRow = {
  id: string;
  name: string;
  email: string;
  organization: string | null;
  interest_area: string | null;
  message: string;
  status: MessageStatus;
  created_at: string;
  updated_at: string;
};

type DbFeedbackRow = {
  id: string;
  name: string;
  email: string | null;
  rating: number;
  comment: string;
  status: FeedbackStatus;
  created_at: string;
  updated_at: string;
};

type DbSubmissionRow = {
  id: string;
  creator_name: string;
  creator_email: string;
  title: string;
  type: string;
  synopsis: string;
  pitch: string;
  status: SubmissionStatus;
  published_catalog_id: string | null;
  created_at: string;
  updated_at: string;
};
type DbAuditRow = {
  id: string;
  actor_user_id: string | null;
  actor_email: string;
  action: string;
  entity_type: string;
  entity_id: string;
  payload_json: string | null;
  created_at: string;
};

function mapUser(row: DbUserRow): UserRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role
  };
}

function mapSubscription(row: DbSubscriptionRow): SubscriptionRecord {
  return {
    userId: row.user_id,
    plan: row.plan,
    status: row.status,
    startedAt: row.started_at,
    renewAt: row.renew_at,
    canceledAt: row.canceled_at
  };
}

function buildReceiptCode(id: string, createdAt: string): string {
  const base = id.replace(/^txn-/, "").replace(/-/g, "").slice(0, 8).toUpperCase();
  const stamp = createdAt.slice(0, 10).replace(/-/g, "");
  return `MUSE-${stamp}-${base}`;
}

function mapBilling(row: DbBillingRow): BillingTransactionRecord {
  return {
    id: row.id,
    receiptCode: buildReceiptCode(row.id, row.created_at),
    userId: row.user_id,
    plan: row.plan,
    amountCents: row.amount_cents,
    currency: row.currency,
    paymentMethod: row.payment_method,
    status: row.status,
    createdAt: row.created_at
  };
}

function mapMessage(row: DbMessageRow): CollaboratorMessageRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    organization: row.organization,
    interestArea: row.interest_area,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapFeedback(row: DbFeedbackRow): FeedbackRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    rating: row.rating,
    comment: row.comment,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapSubmission(row: DbSubmissionRow): SubmissionRecord {
  return {
    id: row.id,
    creatorName: row.creator_name,
    creatorEmail: row.creator_email,
    title: row.title,
    type: row.type,
    synopsis: row.synopsis,
    pitch: row.pitch,
    status: row.status,
    publishedCatalogId: row.published_catalog_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAudit(row: DbAuditRow): AdminAuditRecord {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    payloadJson: row.payload_json,
    createdAt: row.created_at
  };
}
export function createMuseDatabase(dbPathRaw: string) {
  const dbPath = resolve(dbPathRaw);
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      user_id TEXT NOT NULL,
      content_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, content_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS progress (
      user_id TEXT NOT NULL,
      content_id TEXT NOT NULL,
      progress INTEGER NOT NULL CHECK (progress >= 0 AND progress <= 100),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, content_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      user_id TEXT PRIMARY KEY,
      plan TEXT NOT NULL CHECK (plan IN ('monthly', 'yearly')),
      status TEXT NOT NULL CHECK (status IN ('active', 'canceled')),
      started_at TEXT NOT NULL,
      renew_at TEXT,
      canceled_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS billing_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan TEXT NOT NULL CHECK (plan IN ('monthly', 'yearly')),
      amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
      currency TEXT NOT NULL,
      payment_method TEXT NOT NULL CHECK (payment_method IN ('card', 'mobile_money', 'paypal')),
      status TEXT NOT NULL CHECK (status IN ('paid', 'failed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS collaborator_messages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      organization TEXT,
      interest_area TEXT,
      message TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('new', 'reviewed', 'contacted', 'archived')) DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS public_feedback (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('new', 'reviewed', 'featured', 'archived')) DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS content_submissions (
      id TEXT PRIMARY KEY,
      creator_name TEXT NOT NULL,
      creator_email TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      synopsis TEXT NOT NULL,
      pitch TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('submitted', 'under_review', 'approved', 'rejected', 'published')) DEFAULT 'submitted',
      published_catalog_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT,
      actor_email TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const getUserByEmailStmt = db.prepare(`
    SELECT id, name, email, password_hash, role
    FROM users
    WHERE email = ?
  `);

  const getUserByIdStmt = db.prepare(`
    SELECT id, name, email, password_hash, role
    FROM users
    WHERE id = ?
  `);

  const createUserStmt = db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES (?, ?, ?, ?, ?)
  `);

  const countUsersStmt = db.prepare(`
    SELECT COUNT(*) AS total
    FROM users
  `);

  const upsertWatchlistStmt = db.prepare(`
    INSERT INTO watchlist (user_id, content_id)
    VALUES (?, ?)
    ON CONFLICT(user_id, content_id) DO NOTHING
  `);

  const deleteWatchlistStmt = db.prepare(`
    DELETE FROM watchlist
    WHERE user_id = ? AND content_id = ?
  `);

  const getWatchlistStmt = db.prepare(`
    SELECT content_id
    FROM watchlist
    WHERE user_id = ?
    ORDER BY created_at DESC
  `);

  const upsertProgressStmt = db.prepare(`
    INSERT INTO progress (user_id, content_id, progress, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, content_id)
    DO UPDATE SET progress = excluded.progress, updated_at = datetime('now')
  `);

  const getProgressStmt = db.prepare(`
    SELECT content_id, progress
    FROM progress
    WHERE user_id = ?
  `);

  const getSubscriptionStmt = db.prepare(`
    SELECT user_id, plan, status, started_at, renew_at, canceled_at
    FROM subscriptions
    WHERE user_id = ?
  `);

  const activateMonthlySubscriptionStmt = db.prepare(`
    INSERT INTO subscriptions (user_id, plan, status, started_at, renew_at, canceled_at)
    VALUES (?, 'monthly', 'active', datetime('now'), datetime('now', '+30 days'), NULL)
    ON CONFLICT(user_id)
    DO UPDATE SET
      plan = 'monthly',
      status = 'active',
      started_at = datetime('now'),
      renew_at = datetime('now', '+30 days'),
      canceled_at = NULL
  `);

  const activateYearlySubscriptionStmt = db.prepare(`
    INSERT INTO subscriptions (user_id, plan, status, started_at, renew_at, canceled_at)
    VALUES (?, 'yearly', 'active', datetime('now'), datetime('now', '+365 days'), NULL)
    ON CONFLICT(user_id)
    DO UPDATE SET
      plan = 'yearly',
      status = 'active',
      started_at = datetime('now'),
      renew_at = datetime('now', '+365 days'),
      canceled_at = NULL
  `);

  const cancelSubscriptionStmt = db.prepare(`
    UPDATE subscriptions
    SET status = 'canceled', canceled_at = datetime('now'), renew_at = NULL
    WHERE user_id = ?
  `);

  const createBillingStmt = db.prepare(`
    INSERT INTO billing_transactions (id, user_id, plan, amount_cents, currency, payment_method, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const getBillingByIdStmt = db.prepare(`
    SELECT id, user_id, plan, amount_cents, currency, payment_method, status, created_at
    FROM billing_transactions
    WHERE id = ?
  `);

  const activeSubscriptionCountsStmt = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'active' AND plan = 'monthly' THEN 1 ELSE 0 END) AS monthly_total,
      SUM(CASE WHEN status = 'active' AND plan = 'yearly' THEN 1 ELSE 0 END) AS yearly_total
    FROM subscriptions
  `);

  const createMessageStmt = db.prepare(`
    INSERT INTO collaborator_messages (id, name, email, organization, interest_area, message, status)
    VALUES (?, ?, ?, ?, ?, ?, 'new')
  `);

  const listMessagesStmt = db.prepare(`
    SELECT id, name, email, organization, interest_area, message, status, created_at, updated_at
    FROM collaborator_messages
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const listMessagesByStatusStmt = db.prepare(`
    SELECT id, name, email, organization, interest_area, message, status, created_at, updated_at
    FROM collaborator_messages
    WHERE status = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const updateMessageStatusStmt = db.prepare(`
    UPDATE collaborator_messages
    SET status = ?, updated_at = datetime('now')
    WHERE id = ?
  `);

  const getMessageByIdStmt = db.prepare(`
    SELECT id, name, email, organization, interest_area, message, status, created_at, updated_at
    FROM collaborator_messages
    WHERE id = ?
  `);

  const countMessagesByStatusStmt = db.prepare(`
    SELECT COUNT(*) AS total
    FROM collaborator_messages
    WHERE status = ?
  `);

  const createFeedbackStmt = db.prepare(`
    INSERT INTO public_feedback (id, name, email, rating, comment, status)
    VALUES (?, ?, ?, ?, ?, 'new')
  `);

  const listFeedbackStmt = db.prepare(`
    SELECT id, name, email, rating, comment, status, created_at, updated_at
    FROM public_feedback
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const listFeedbackByStatusStmt = db.prepare(`
    SELECT id, name, email, rating, comment, status, created_at, updated_at
    FROM public_feedback
    WHERE status = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const updateFeedbackStatusStmt = db.prepare(`
    UPDATE public_feedback
    SET status = ?, updated_at = datetime('now')
    WHERE id = ?
  `);

  const getFeedbackByIdStmt = db.prepare(`
    SELECT id, name, email, rating, comment, status, created_at, updated_at
    FROM public_feedback
    WHERE id = ?
  `);

  const countFeedbackByStatusStmt = db.prepare(`
    SELECT COUNT(*) AS total
    FROM public_feedback
    WHERE status = ?
  `);

  const createSubmissionStmt = db.prepare(`
    INSERT INTO content_submissions (id, creator_name, creator_email, title, type, synopsis, pitch, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted')
  `);

  const listSubmissionsStmt = db.prepare(`
    SELECT id, creator_name, creator_email, title, type, synopsis, pitch, status, published_catalog_id, created_at, updated_at
    FROM content_submissions
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const listSubmissionsByStatusStmt = db.prepare(`
    SELECT id, creator_name, creator_email, title, type, synopsis, pitch, status, published_catalog_id, created_at, updated_at
    FROM content_submissions
    WHERE status = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const updateSubmissionStmt = db.prepare(`
    UPDATE content_submissions
    SET status = ?, published_catalog_id = ?, updated_at = datetime('now')
    WHERE id = ?
  `);

  const getSubmissionByIdStmt = db.prepare(`
    SELECT id, creator_name, creator_email, title, type, synopsis, pitch, status, published_catalog_id, created_at, updated_at
    FROM content_submissions
    WHERE id = ?
  `);

  const listPublishedSubmissionsStmt = db.prepare(`
    SELECT id, creator_name, creator_email, title, type, synopsis, pitch, status, published_catalog_id, created_at, updated_at
    FROM content_submissions
    WHERE status = 'published'
    ORDER BY created_at DESC
  `);

  const countSubmissionByStatusStmt = db.prepare(`
    SELECT COUNT(*) AS total
    FROM content_submissions
    WHERE status = ?
  `);
  const insertAuditLogStmt = db.prepare(`
    INSERT INTO admin_audit_logs (id, actor_user_id, actor_email, action, entity_type, entity_id, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const listAuditLogsStmt = db.prepare(`
    SELECT id, actor_user_id, actor_email, action, entity_type, entity_id, payload_json, created_at
    FROM admin_audit_logs
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const countMessagesAllStmt = db.prepare(`SELECT COUNT(*) AS total FROM collaborator_messages`);
  const countFeedbackAllStmt = db.prepare(`SELECT COUNT(*) AS total FROM public_feedback`);
  const countSubmissionsAllStmt = db.prepare(`SELECT COUNT(*) AS total FROM content_submissions`);

  function seedMvpData(): void {
    const shouldSeed = String(process.env.SEED_MVP_DATA || "true").toLowerCase() !== "false";
    if (!shouldSeed) return;

    const messagesTotal = (countMessagesAllStmt.get() as { total: number }).total;
    if (messagesTotal === 0) {
      createMessageStmt.run("msg-seed-001", "Awa Diop", "awa@studio-africa.com", "Studio Africa", "co-production", "Nous cherchons un partenaire de distribution regional.");
      createMessageStmt.run("msg-seed-002", "Moussa Traore", "moussa@cinelab.io", "CineLab", "investissement", "Interesse par un ticket seed et un partenariat data telecom.");
      updateMessageStatusStmt.run("reviewed", "msg-seed-002");
    }

    const feedbackTotal = (countFeedbackAllStmt.get() as { total: number }).total;
    if (feedbackTotal === 0) {
      createFeedbackStmt.run("fb-seed-001", "Nadia", "nadia@example.com", 5, "Interface premium, j'adore la navigation par humeur.");
      createFeedbackStmt.run("fb-seed-002", "Koffi", "koffi@example.com", 4, "Bonne base, ajouter plus de films publies rapidement.");
      updateFeedbackStatusStmt.run("featured", "fb-seed-001");
    }

    const submissionsTotal = (countSubmissionsAllStmt.get() as { total: number }).total;
    if (submissionsTotal === 0) {
      createSubmissionStmt.run("sub-seed-001", "Fatou Mbaye", "fatou@crea.sn", "Sables Rouges", "film", "Un drame social ancre a Dakar.", "Film auteur avec potentiel festival.");
      createSubmissionStmt.run("sub-seed-002", "Jean Ndo", "jean@docflow.cm", "Voix du Fleuve", "documentaire", "Une serie documentaire sur les artisans.", "Format 6x26 min pour TV et OTT.");
      updateSubmissionStmt.run("published", "community-seed001", "sub-seed-001");
      updateSubmissionStmt.run("under_review", null, "sub-seed-002");
    }
  }

  const checkoutSubscriptionTx = db.transaction((input: {
    id: string;
    userId: string;
    plan: SubscriptionPlan;
    amountCents: number;
    currency: string;
    paymentMethod: BillingPaymentMethod;
    status: BillingTransactionStatus;
  }) => {
    createBillingStmt.run(
      input.id,
      input.userId,
      input.plan,
      input.amountCents,
      input.currency,
      input.paymentMethod,
      input.status
    );

    if (input.status === "paid") {
      if (input.plan === "monthly") {
        activateMonthlySubscriptionStmt.run(input.userId);
      } else {
        activateYearlySubscriptionStmt.run(input.userId);
      }
    }

    const transaction = mapBilling(getBillingByIdStmt.get(input.id) as DbBillingRow);
    const subscriptionRow = getSubscriptionStmt.get(input.userId) as DbSubscriptionRow | undefined;

    return {
      transaction,
      subscription: subscriptionRow ? mapSubscription(subscriptionRow) : null
    };
  });

  seedMvpData();

  return {
    dbPath,
    close() {
      db.close();
    },
    findUserByEmail(email: string): UserRecord | null {
      const row = getUserByEmailStmt.get(email) as DbUserRow | undefined;
      return row ? mapUser(row) : null;
    },
    findUserById(id: string): UserRecord | null {
      const row = getUserByIdStmt.get(id) as DbUserRow | undefined;
      return row ? mapUser(row) : null;
    },
    createUser(input: UserRecord): UserRecord {
      createUserStmt.run(input.id, input.name, input.email, input.passwordHash, input.role);
      return input;
    },
    countUsers(): number {
      const row = countUsersStmt.get() as { total: number };
      return row.total;
    },
    addToWatchlist(userId: string, contentId: string): void {
      upsertWatchlistStmt.run(userId, contentId);
    },
    removeFromWatchlist(userId: string, contentId: string): void {
      deleteWatchlistStmt.run(userId, contentId);
    },
    getWatchlist(userId: string): string[] {
      const rows = getWatchlistStmt.all(userId) as Array<{ content_id: string }>;
      return rows.map((row) => row.content_id);
    },
    setProgress(userId: string, contentId: string, progress: number): void {
      upsertProgressStmt.run(userId, contentId, progress);
    },
    getProgress(userId: string): Record<string, number> {
      const rows = getProgressStmt.all(userId) as Array<{ content_id: string; progress: number }>;
      return Object.fromEntries(rows.map((row) => [row.content_id, row.progress]));
    },
    getSubscription(userId: string): SubscriptionRecord | null {
      const row = getSubscriptionStmt.get(userId) as DbSubscriptionRow | undefined;
      return row ? mapSubscription(row) : null;
    },
    activateSubscription(userId: string, plan: SubscriptionPlan): SubscriptionRecord {
      if (plan === "monthly") {
        activateMonthlySubscriptionStmt.run(userId);
      } else {
        activateYearlySubscriptionStmt.run(userId);
      }
      const saved = getSubscriptionStmt.get(userId) as DbSubscriptionRow;
      return mapSubscription(saved);
    },
    cancelSubscription(userId: string): SubscriptionRecord | null {
      cancelSubscriptionStmt.run(userId);
      const row = getSubscriptionStmt.get(userId) as DbSubscriptionRow | undefined;
      return row ? mapSubscription(row) : null;
    },
    checkoutSubscription(input: {
      id: string;
      userId: string;
      plan: SubscriptionPlan;
      amountCents: number;
      currency: string;
      paymentMethod: BillingPaymentMethod;
      status: BillingTransactionStatus;
    }): { transaction: BillingTransactionRecord; subscription: SubscriptionRecord | null } {
      return checkoutSubscriptionTx(input);
    },
    getBillingHistory(userId: string, filters: BillingHistoryFilters = {}): BillingTransactionRecord[] {
      const conditions: string[] = ["user_id = ?"];
      const params: Array<string | number> = [userId];

      if (filters.status) {
        conditions.push("status = ?");
        params.push(filters.status);
      }

      if (filters.plan) {
        conditions.push("plan = ?");
        params.push(filters.plan);
      }

      const safeLimit = Math.max(1, Math.min(100, Math.trunc(filters.limit ?? 20)));
      const query = `
        SELECT id, user_id, plan, amount_cents, currency, payment_method, status, created_at
        FROM billing_transactions
        WHERE ${conditions.join(" AND ")}
        ORDER BY created_at DESC
        LIMIT ?
      `;

      params.push(safeLimit);
      const rows = db.prepare(query).all(...params) as DbBillingRow[];
      return rows.map(mapBilling);
    },
    getActiveSubscriptionCounts(): { monthly: number; yearly: number } {
      const row = activeSubscriptionCountsStmt.get() as { monthly_total: number | null; yearly_total: number | null };
      return {
        monthly: row.monthly_total ?? 0,
        yearly: row.yearly_total ?? 0
      };
    },
    createCollaboratorMessage(input: {
      id: string;
      name: string;
      email: string;
      organization?: string | null;
      interestArea?: string | null;
      message: string;
    }): CollaboratorMessageRecord {
      createMessageStmt.run(
        input.id,
        input.name,
        input.email,
        input.organization ?? null,
        input.interestArea ?? null,
        input.message
      );
      const row = getMessageByIdStmt.get(input.id) as DbMessageRow;
      return mapMessage(row);
    },
    getCollaboratorMessages(limit = 50, status?: MessageStatus): CollaboratorMessageRecord[] {
      const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
      const rows = status
        ? (listMessagesByStatusStmt.all(status, safeLimit) as DbMessageRow[])
        : (listMessagesStmt.all(safeLimit) as DbMessageRow[]);
      return rows.map(mapMessage);
    },
    updateCollaboratorMessageStatus(id: string, status: MessageStatus): CollaboratorMessageRecord | null {
      updateMessageStatusStmt.run(status, id);
      const row = getMessageByIdStmt.get(id) as DbMessageRow | undefined;
      return row ? mapMessage(row) : null;
    },
    countCollaboratorMessagesByStatus(status: MessageStatus): number {
      const row = countMessagesByStatusStmt.get(status) as { total: number };
      return row.total;
    },
    createFeedback(input: {
      id: string;
      name: string;
      email?: string | null;
      rating: number;
      comment: string;
    }): FeedbackRecord {
      createFeedbackStmt.run(input.id, input.name, input.email ?? null, input.rating, input.comment);
      const row = getFeedbackByIdStmt.get(input.id) as DbFeedbackRow;
      return mapFeedback(row);
    },
    getFeedback(limit = 50, status?: FeedbackStatus): FeedbackRecord[] {
      const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
      const rows = status
        ? (listFeedbackByStatusStmt.all(status, safeLimit) as DbFeedbackRow[])
        : (listFeedbackStmt.all(safeLimit) as DbFeedbackRow[]);
      return rows.map(mapFeedback);
    },
    updateFeedbackStatus(id: string, status: FeedbackStatus): FeedbackRecord | null {
      updateFeedbackStatusStmt.run(status, id);
      const row = getFeedbackByIdStmt.get(id) as DbFeedbackRow | undefined;
      return row ? mapFeedback(row) : null;
    },
    countFeedbackByStatus(status: FeedbackStatus): number {
      const row = countFeedbackByStatusStmt.get(status) as { total: number };
      return row.total;
    },
    createSubmission(input: {
      id: string;
      creatorName: string;
      creatorEmail: string;
      title: string;
      type: string;
      synopsis: string;
      pitch: string;
    }): SubmissionRecord {
      createSubmissionStmt.run(
        input.id,
        input.creatorName,
        input.creatorEmail,
        input.title,
        input.type,
        input.synopsis,
        input.pitch
      );
      const row = getSubmissionByIdStmt.get(input.id) as DbSubmissionRow;
      return mapSubmission(row);
    },
    getSubmissions(limit = 100, status?: SubmissionStatus): SubmissionRecord[] {
      const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
      const rows = status
        ? (listSubmissionsByStatusStmt.all(status, safeLimit) as DbSubmissionRow[])
        : (listSubmissionsStmt.all(safeLimit) as DbSubmissionRow[]);
      return rows.map(mapSubmission);
    },
    updateSubmission(input: {
      id: string;
      status: SubmissionStatus;
      publishedCatalogId?: string | null;
    }): SubmissionRecord | null {
      updateSubmissionStmt.run(input.status, input.publishedCatalogId ?? null, input.id);
      const row = getSubmissionByIdStmt.get(input.id) as DbSubmissionRow | undefined;
      return row ? mapSubmission(row) : null;
    },
    getPublishedSubmissions(): SubmissionRecord[] {
      const rows = listPublishedSubmissionsStmt.all() as DbSubmissionRow[];
      return rows.map(mapSubmission);
    },
    countSubmissionsByStatus(status: SubmissionStatus): number {
      const row = countSubmissionByStatusStmt.get(status) as { total: number };
      return row.total;
    },
    appendAdminAuditLog(input: {
      id: string;
      actorUserId?: string | null;
      actorEmail: string;
      action: string;
      entityType: string;
      entityId: string;
      payloadJson?: string | null;
    }): AdminAuditRecord {
      insertAuditLogStmt.run(
        input.id,
        input.actorUserId ?? null,
        input.actorEmail,
        input.action,
        input.entityType,
        input.entityId,
        input.payloadJson ?? null
      );
      const rows = listAuditLogsStmt.all(1) as DbAuditRow[];
      return mapAudit(rows[0]);
    },
    getAdminAuditLogs(limit = 100): AdminAuditRecord[] {
      const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
      const rows = listAuditLogsStmt.all(safeLimit) as DbAuditRow[];
      return rows.map(mapAudit);
    }
  };
}