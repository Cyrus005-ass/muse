import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync } from "node:fs";
import { rename } from "node:fs/promises";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  createMuseDatabase,
  type BillingPaymentMethod,
  type BillingTransactionStatus,
  type FeedbackStatus,
  type MessageStatus,
  type SubmissionStatus,
  type SubscriptionPlan,
  type UserRecord,
  type UserRole
} from "./db.js";
import { getPricingSnapshot } from "./pricing.js";
import {
  getCatalog,
  getMoodCatalog,
  getMoodRecommendations,
  resolveStreamProfile,
  computeTasteGraph,
  type CatalogItem,
  type StreamProfile
} from "./catalog.js";
import { createStudioDatabase } from "./studioDb.js";
import {
  ensurePosterFallback,
  generateSrtIfMissing,
  runAiDub,
  runHaacScan,
  runQc,
  transcodeToHls,
  writeSimpleContract
} from "./studioPipeline.js";

dotenv.config({ path: "../../.env" });

type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
};

type AuthBody = {
  email: string;
  password: string;
  name?: string;
};

type WatchlistBody = {
  contentId?: string;
};

type ProgressBody = {
  progress?: number;
};

type SubscriptionBody = {
  plan?: SubscriptionPlan;
};

type BillingCheckoutBody = {
  plan?: SubscriptionPlan;
  paymentMethod?: BillingPaymentMethod;
  simulateFailure?: boolean;
};

type BillingHistoryQuery = {
  limit?: string;
  status?: BillingTransactionStatus | "all";
  plan?: SubscriptionPlan | "all";
};

type CatalogEnrichedQuery = {
  mood?: string;
  region?: string;
  search?: string;
  type?: string;
  status?: string;
  limit?: string;
};

type CatalogRecommendationQuery = {
  mood?: string;
  limit?: string;
};

type StreamQuery = {
  profile?: StreamProfile;
};

type PublicMessageBody = {
  name?: string;
  email?: string;
  organization?: string;
  interestArea?: string;
  message?: string;
};

type PublicFeedbackBody = {
  name?: string;
  email?: string;
  rating?: number;
  comment?: string;
};

type PublicSubmissionBody = {
  creatorName?: string;
  creatorEmail?: string;
  title?: string;
  type?: string;
  synopsis?: string;
  pitch?: string;
};

type AdminListQuery = {
  status?: string;
  limit?: string;
};
type AdminAuditQuery = {
  limit?: string;
};

type AdminUpdateMessageBody = {
  status?: MessageStatus;
};

type AdminUpdateFeedbackBody = {
  status?: FeedbackStatus;
};

type AdminUpdateSubmissionBody = {
  status?: SubmissionStatus;
  publishToCatalog?: boolean;
};

const port = Number(process.env.API_PORT || 4000);
const adminApiKey = process.env.ADMIN_API_KEY || "muse-admin-dev";
const jwtSecret = process.env.JWT_SECRET || "muse-dev-secret-change-me";
const dbPath = process.env.DB_PATH || "./data/muse.db";
const demoHls = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
const projectRoot = resolve(process.cwd(), "../..");
const storageRoot = resolve(projectRoot, "storage");
const modelsPath = process.env.MODELS_PATH || "/models/voices";
const afriGlossaryPath = resolve(projectRoot, "data", "glossaire_fr_fon.csv");
const enableAiDub = String(process.env.ENABLE_AI_DUB || "true").toLowerCase() === "true";
const haacStrictMode = String(process.env.HAAC_STRICT_MODE || "true").toLowerCase() === "true";
const corsOrigins = (process.env.CORS_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean);

const store = createMuseDatabase(dbPath);
const studioStore = createStudioDatabase(dbPath);
const app = Fastify({ logger: true });

const adminSeedPassword = process.env.ADMIN_PASSWORD || "Admin@1234";
const adminSeedEmail = (process.env.ADMIN_EMAIL || "admin@muse.local").toLowerCase();

const existingAdmin = store.findUserByEmail(adminSeedEmail);
if (!existingAdmin) {
  const adminSeedHash = bcrypt.hashSync(adminSeedPassword, 10);
  store.createUser({
    id: "usr-admin-001",
    name: "Muse Admin",
    email: adminSeedEmail,
    passwordHash: adminSeedHash,
    role: "admin"
  });
}
const existingDemoUser = store.findUserByEmail("viewer@muse.local");
if (!existingDemoUser) {
  const demoHash = bcrypt.hashSync("Viewer@1234", 10);
  store.createUser({
    id: "usr-demo-001",
    name: "Muse Viewer",
    email: "viewer@muse.local",
    passwordHash: demoHash,
    role: "user"
  });
}

await app.register(cors, {
  origin: corsOrigins.length > 0 ? corsOrigins : true,
});
await app.register(multipart, {
  attachFieldsToBody: false,
  limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 6 }
});

function signToken(user: UserRecord): string {
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role
  };
  return jwt.sign(payload, jwtSecret, { expiresIn: "12h" });
}

function getBearerToken(request: FastifyRequest): string | null {
  const auth = request.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

function verifyToken(request: FastifyRequest): JwtPayload | null {
  const token = getBearerToken(request);
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, jwtSecret) as JwtPayload;
    return decoded;
  } catch {
    return null;
  }
}

function ensureAuthenticated(request: FastifyRequest, reply: FastifyReply): UserRecord | null {
  const payload = verifyToken(request);
  if (!payload) {
    reply.status(401).send({ error: "Missing or invalid token" });
    return null;
  }

  const user = store.findUserById(payload.sub);
  if (!user) {
    reply.status(404).send({ error: "User not found" });
    return null;
  }

  return user;
}

function ensureAdmin(request: FastifyRequest, reply: FastifyReply): JwtPayload | null {
  const key = request.headers["x-admin-key"];
  const headerValue = Array.isArray(key) ? key[0] : key;

  if (typeof headerValue === "string" && headerValue === adminApiKey) {
    return {
      sub: "legacy-admin-key",
      email: "legacy-admin-key@muse.local",
      role: "admin"
    };
  }

  const payload = verifyToken(request);
  if (!payload) {
    reply.status(401).send({ error: "Missing or invalid token" });
    return null;
  }

  if (payload.role !== "admin") {
    reply.status(403).send({ error: "Admin role required" });
    return null;
  }

  return payload;
}

function normalizeLimit(raw: string | undefined, fallback: number, min = 1, max = 100): number {
  const value = Number(raw ?? String(fallback));
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const rateWindow = new Map<string, { count: number; resetAt: number }>();

function cleanText(value: string | undefined, min: number, max: number): string | null {
  const text = value?.trim();
  if (!text) return null;
  if (text.length < min || text.length > max) return null;
  return text;
}

function normalizeEmail(value: string | undefined): string | null {
  const email = value?.trim().toLowerCase();
  if (!email) return null;
  if (email.length > 160) return null;
  if (!emailRegex.test(email)) return null;
  return email;
}

function checkRateLimit(request: FastifyRequest, reply: FastifyReply, scope: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const key = `${scope}:${request.ip}`;
  const state = rateWindow.get(key);

  if (!state || state.resetAt <= now) {
    rateWindow.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (state.count >= max) {
    reply.status(429).send({ error: "Too many requests, please retry later." });
    return false;
  }

  state.count += 1;
  return true;
}

function writeAdminAudit(input: {
  actor: JwtPayload;
  action: string;
  entityType: string;
  entityId: string;
  payload?: unknown;
}) {
  store.appendAdminAuditLog({
    id: `audit-${randomUUID()}`,
    actorUserId: input.actor.sub,
    actorEmail: input.actor.email,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    payloadJson: input.payload ? JSON.stringify(input.payload) : null
  });
}
function writeStudioAudit(input: {
  actor: JwtPayload;
  action: string;
  entityType: string;
  entityId: string;
  payload?: unknown;
}) {
  try {
    studioStore.appendAdminAudit({
      id: `audit-${randomUUID()}`,
      actorUserId: input.actor.sub,
      actorEmail: input.actor.email,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      payloadJson: input.payload ? JSON.stringify(input.payload) : null
    });
  } catch {
    // keep API resilient even if audit insert fails
  }
}

function safeFileName(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function notifyAdminTelegram(message: string): Promise<void> {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (!botToken || !chatId) return;

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message })
    });
  } catch {
    // keep flow resilient
  }
}

function runBackground(task: () => Promise<void>) {
  setTimeout(() => {
    void task().catch(() => undefined);
  }, 20);
}

async function processSubmissionPipeline(submissionId: number): Promise<void> {
  try {
    const submission = studioStore.getSubmissionById(submissionId);
    if (!submission) return;

    const hlsDir = resolve(storageRoot, "hls", submission.contentId);
    const hls = await transcodeToHls(submission.filePath, hlsDir);
    if (!hls.ok) {
      studioStore.updateSubmissionStatus(submission.id, "NEED_RESUBMIT", "Transcode HLS impossible");
      studioStore.updateContentCompliance({ id: submission.contentId, qcStatus: "FAILED", haacStatus: "QUARANTAINE" });
      return;
    }

    const qc = await runQc(submission.filePath, projectRoot);
    if (qc.qcStatus === "FAILED") {
      studioStore.updateSubmissionStatus(submission.id, "NEED_RESUBMIT", qc.adminNote || "Bitrate trop bas");
      studioStore.updateContentCompliance({ id: submission.contentId, qcStatus: "FAILED", hlsPath: hls.playlist, haacStatus: "QUARANTAINE" });
      return;
    }

    const srtPath = resolve(hlsDir, "vo.srt");
    await generateSrtIfMissing(submission.filePath, srtPath, projectRoot);

    studioStore.clearFlags(submission.contentId);
    const scan = await runHaacScan({
      contentId: submission.contentId,
      videoPath: submission.filePath,
      srtPath,
      outputDir: resolve(hlsDir, "haac"),
      projectRoot
    });

    for (const flag of scan.flags) {
      studioStore.addFlag({
        contentId: submission.contentId,
        flagType: flag.flagType,
        severity: flag.severity,
        aiConfidence: flag.aiConfidence,
        evidence: flag.evidence
      });
    }

    const finalHaac = haacStrictMode && scan.haacStatus === "VISA_OK" ? "VISA_OK" : scan.haacStatus;
    const submissionStatus = finalHaac === "QUARANTAINE" ? "QUARANTAINE" : "VISA_HAAC";

    studioStore.updateContentCompliance({
      id: submission.contentId,
      qcStatus: "PASSED",
      haacStatus: finalHaac,
      hlsPath: hls.playlist,
      subtitlesPath: srtPath
    });
    studioStore.updateSubmissionStatus(submission.id, submissionStatus, finalHaac === "QUARANTAINE" ? "Contenu en quarantaine HAAC" : "Pret pour visa admin");
  } catch {
    // background resilience
  }
}

async function runDubPipeline(contentId: string, lang: string): Promise<{ ok: boolean; message: string }> {
  try {
    const content = studioStore.getContent(contentId);
    if (!content || !content.subtitlesPath) {
      return { ok: false, message: "content missing pipeline assets" };
    }

    const sourceVideo = studioStore.listSubmissions(1000).find((item) => item.contentId === contentId)?.filePath;
    if (!sourceVideo) return { ok: false, message: "source video unavailable" };

    const out = await runAiDub({
      contentId,
      targetLang: lang,
      videoPath: sourceVideo,
      srtPath: content.subtitlesPath,
      outputDir: resolve(storageRoot, "hls", contentId),
      projectRoot,
      modelsPath,
      afriGlossaryPath
    });

    if (!out.ok) return { ok: false, message: out.message };

    studioStore.appendAiDubLang(contentId, lang);
    return { ok: true, message: "ok" };
  } catch (error) {
    return { ok: false, message: String(error) };
  }
}
function parseMessageStatus(value: string | undefined): MessageStatus | undefined {
  if (!value) return undefined;
  if (value === "new" || value === "reviewed" || value === "contacted" || value === "archived") return value;
  return undefined;
}

function parseFeedbackStatus(value: string | undefined): FeedbackStatus | undefined {
  if (!value) return undefined;
  if (value === "new" || value === "reviewed" || value === "featured" || value === "archived") return value;
  return undefined;
}

function parseSubmissionStatus(value: string | undefined): SubmissionStatus | undefined {
  if (!value) return undefined;
  if (value === "submitted" || value === "under_review" || value === "approved" || value === "rejected" || value === "published") return value;
  return undefined;
}

function sanitizeCatalogType(value: string): CatalogItem["type"] {
  if (value === "film" || value === "documentaire" || value === "serie" || value === "court-metrage") {
    return value;
  }
  return "film";
}

function keywordMoods(text: string): string[] {
  const source = text.toLowerCase();
  const out: string[] = [];
  if (/intense|thriller|action|rage/.test(source)) out.push("intense");
  if (/memoire|societe|archive|doc/.test(source)) out.push("reflexif");
  if (/espoir|inspir|creation|talent/.test(source)) out.push("inspirant");
  if (/nuit|noir|sombre/.test(source)) out.push("sombre");
  if (/musique|rythme|energie|urbain/.test(source)) out.push("electrique");
  if (/poesie|calme|nature|voyage/.test(source)) out.push("apaisant");
  if (out.length === 0) out.push("inspirant");
  return [...new Set(out)].slice(0, 3);
}

function mapSubmissionToCatalogItem(input: ReturnType<typeof store.getPublishedSubmissions>[number]): CatalogItem {
  const publishedId = input.publishedCatalogId || `community-${input.id.slice(-8)}`;
  return {
    id: publishedId,
    title: input.title,
    type: sanitizeCatalogType(input.type),
    year: Number(input.createdAt.slice(0, 4)) || new Date().getFullYear(),
    status: "published",
    synopsis: input.synopsis,
    duration: "1h20",
    genres: ["Independant", "Creation"],
    moods: keywordMoods(`${input.title} ${input.synopsis} ${input.pitch}`),
    regions: ["diaspora"],
    score: 84,
    hlsUrl: demoHls
  };
}

function filterCatalogItems(items: CatalogItem[], filters: CatalogEnrichedQuery): CatalogItem[] {
  const mood = filters.mood?.trim().toLowerCase();
  const region = filters.region?.trim().toLowerCase();
  const search = filters.search?.trim().toLowerCase();
  const type = filters.type?.trim().toLowerCase();
  const status = filters.status?.trim().toLowerCase();

  return items.filter((item) => {
    if (mood && mood !== "all" && !item.moods.some((m) => m.toLowerCase() === mood)) return false;
    if (region && region !== "all" && !item.regions.some((r) => r.toLowerCase() === region)) return false;
    if (type && type !== "all" && item.type.toLowerCase() !== type) return false;
    if (status && status !== "all" && item.status.toLowerCase() !== status) return false;

    if (search) {
      const haystack = `${item.title} ${item.synopsis} ${item.genres.join(" ")} ${item.moods.join(" ")}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    return true;
  });
}

function getUnifiedCatalog(filters: CatalogEnrichedQuery = {}): CatalogItem[] {
  const staticItems = getCatalog();
  const communityItems = store.getPublishedSubmissions().map(mapSubmissionToCatalogItem);

  const merged = [...communityItems, ...staticItems]
    .sort((a, b) => b.score - a.score)
    .filter((item, index, arr) => arr.findIndex((other) => other.id === item.id) === index);

  const filtered = filterCatalogItems(merged, filters);
  const limit = normalizeLimit(filters.limit, 20, 1, 50);
  return filtered.slice(0, limit);
}

app.get("/health", async () => {
  return { status: "ok", service: "muse-api", db: "sqlite", dbPath: store.dbPath };
});

app.get("/", async () => {
  return {
    service: "muse-api",
    status: "ok",
    message: "API en ligne. Utilise /health, /api/v1/catalog, /api/v1/auth/*, /api/v1/me/*, /api/v1/public/* et /api/v1/admin/*"
  };
});

app.get("/favicon.ico", async (_request, reply) => {
  return reply.code(204).send();
});

app.get("/api/v1/billing/pricing", async () => {
  return getPricingSnapshot();
});

const creatorSubmitHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const user = ensureAuthenticated(request, reply);
    if (!user) return;

    const uploadId = randomUUID();
    const workingDir = resolve(storageRoot, "submissions", uploadId);
    mkdirSync(workingDir, { recursive: true });

    const fields = new Map<string, string>();
    let videoPath: string | null = null;
    let posterPath: string | null = null;
    let rightsPath: string | null = null;

    const parts = request.parts();
    for await (const part of parts) {
      if (part.type === "file") {
        const name = safeFileName(part.filename || `${part.fieldname}.bin`);
        const target = resolve(workingDir, name);
        mkdirSync(resolve(target, ".."), { recursive: true });
        await pipeline(part.file, createWriteStream(target));

        if (part.fieldname === "video") videoPath = target;
        if (part.fieldname === "poster") posterPath = target;
        if (part.fieldname === "rights") rightsPath = target;
      } else {
        fields.set(part.fieldname, String(part.value ?? ""));
      }
    }

    if (!videoPath) {
      return reply.status(400).send({ error: "video is required" });
    }

    const title = cleanText(fields.get("title"), 2, 180) ?? `Soumission ${uploadId.slice(0, 6)}`;
    const synopsis = cleanText(fields.get("synopsis"), 20, 4000) ?? "Synopsis non fourni";
    const originalLang = (fields.get("original_lang") || "fr").trim().toLowerCase();
    const allowAiDub = ["true", "1", "yes", "on"].includes((fields.get("allow_ai_dub") || "false").toLowerCase());

    const contentId = `content-${uploadId.slice(0, 8)}`;
    const saved = studioStore.createSubmission({
      userId: user.id,
      title,
      filePath: videoPath,
      posterPath,
      synopsis,
      originalLang,
      allowAiDub,
      rightsFilePath: rightsPath,
      contentId
    });

    const hlsDir = resolve(storageRoot, "hls", contentId);
    const canonicalPoster = posterPath ? resolve(hlsDir, "poster.jpg") : null;
    await ensurePosterFallback(posterPath, canonicalPoster ?? resolve(hlsDir, "poster.jpg"));

    studioStore.upsertContent({
      id: contentId,
      title,
      creatorId: user.id,
      posterPath: canonicalPoster,
      allowAiDub,
      originalLang,
      aiDubLangs: [],
      rightsJson: rightsPath ? JSON.stringify({ owner: user.email, contract_url: rightsPath, territory: ["BJ", "TG"], expiry: null }) : null,
      qcStatus: "PENDING",
      haacStatus: "DRAFT",
      revsharePct: 70
    });

    await notifyAdminTelegram(`Nouvelle soumission createur: ${title} (${contentId})`);
    runBackground(async () => processSubmissionPipeline(saved.id));

    return reply.status(202).send({ submission: saved, contentId, status: "UPLOADED" });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: "creator submission failed" });
  }
};

app.post("/creator/submit", creatorSubmitHandler);
app.post("/api/v1/creator/submit", creatorSubmitHandler);

app.post<{ Body: PublicMessageBody }>("/api/v1/public/messages", async (request, reply) => {
  if (!checkRateLimit(request, reply, "public-message", 20, 10 * 60 * 1000)) return;

  const { name, email, organization, interestArea, message } = request.body || {};
  const safeName = cleanText(name, 2, 100);
  const safeEmail = normalizeEmail(email);
  const safeMessage = cleanText(message, 10, 2000);

  if (!safeName || !safeEmail || !safeMessage) {
    return reply.status(400).send({ error: "invalid name, email or message" });
  }

  const saved = store.createCollaboratorMessage({
    id: `msg-${randomUUID()}`,
    name: safeName,
    email: safeEmail,
    organization: cleanText(organization, 0, 120),
    interestArea: cleanText(interestArea, 0, 120),
    message: safeMessage
  });

  return reply.status(201).send({ item: saved });
});

app.post<{ Body: PublicFeedbackBody }>("/api/v1/public/feedback", async (request, reply) => {
  if (!checkRateLimit(request, reply, "public-feedback", 30, 10 * 60 * 1000)) return;

  const { name, email, rating, comment } = request.body || {};
  const safeName = cleanText(name, 2, 100);
  const safeComment = cleanText(comment, 5, 1200);
  const safeEmail = email?.trim() ? normalizeEmail(email) : null;

  if (!safeName || !safeComment || typeof rating !== "number") {
    return reply.status(400).send({ error: "invalid feedback payload" });
  }

  const safeRating = Math.max(1, Math.min(5, Math.round(rating)));
  const saved = store.createFeedback({
    id: `fb-${randomUUID()}`,
    name: safeName,
    email: safeEmail,
    rating: safeRating,
    comment: safeComment
  });

  return reply.status(201).send({ item: saved });
});

app.post<{ Body: PublicSubmissionBody }>("/api/v1/public/submissions", async (request, reply) => {
  if (!checkRateLimit(request, reply, "public-submission", 12, 10 * 60 * 1000)) return;

  const { creatorName, creatorEmail, title, type, synopsis, pitch } = request.body || {};
  const safeCreatorName = cleanText(creatorName, 2, 100);
  const safeCreatorEmail = normalizeEmail(creatorEmail);
  const safeTitle = cleanText(title, 2, 160);
  const safeType = cleanText(type, 2, 40);
  const safeSynopsis = cleanText(synopsis, 20, 2500);
  const safePitch = cleanText(pitch, 20, 2500);

  if (!safeCreatorName || !safeCreatorEmail || !safeTitle || !safeType || !safeSynopsis || !safePitch) {
    return reply.status(400).send({ error: "invalid submission payload" });
  }

  const saved = store.createSubmission({
    id: `sub-${randomUUID()}`,
    creatorName: safeCreatorName,
    creatorEmail: safeCreatorEmail,
    title: safeTitle,
    type: safeType.toLowerCase(),
    synopsis: safeSynopsis,
    pitch: safePitch
  });

  return reply.status(201).send({ item: saved });
});

app.post<{ Body: AuthBody }>("/api/v1/auth/register", async (request, reply) => {
  if (!checkRateLimit(request, reply, "auth-register", 12, 10 * 60 * 1000)) return;

  const { email, password, name } = request.body || {};
  const safeEmail = normalizeEmail(email);
  const safeName = cleanText(name, 2, 90);
  const safePassword = password?.trim();

  if (!safeEmail || !safeName || !safePassword || safePassword.length < 8 || safePassword.length > 120) {
    return reply.status(400).send({ error: "invalid registration payload" });
  }

  if (store.findUserByEmail(safeEmail)) {
    return reply.status(409).send({ error: "email already exists" });
  }

  const passwordHash = await bcrypt.hash(safePassword, 10);
  const user: UserRecord = {
    id: `usr-${randomUUID()}`,
    name: safeName,
    email: safeEmail,
    passwordHash,
    role: "user"
  };

  store.createUser(user);

  const token = signToken(user);

  return reply.status(201).send({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  });
});

app.post<{ Body: AuthBody }>("/api/v1/auth/login", async (request, reply) => {
  if (!checkRateLimit(request, reply, "auth-login", 20, 10 * 60 * 1000)) return;

  const { email, password } = request.body || {};
  const safeEmail = normalizeEmail(email);
  const safePassword = password?.trim();
  if (!safeEmail || !safePassword) {
    return reply.status(400).send({ error: "email and password are required" });
  }

  const user = store.findUserByEmail(safeEmail);
  if (!user) {
    return reply.status(401).send({ error: "invalid credentials" });
  }

  const ok = await bcrypt.compare(safePassword, user.passwordHash);
  if (!ok) {
    return reply.status(401).send({ error: "invalid credentials" });
  }

  if (user.role === "admin") {
    writeAdminAudit({
      actor: { sub: user.id, email: user.email, role: user.role },
      action: "ADMIN_LOGIN",
      entityType: "session",
      entityId: user.id
    });
  }

  const token = signToken(user);
  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  };
});

app.get("/api/v1/auth/me", async (request, reply) => {
  const user = ensureAuthenticated(request, reply);
  if (!user) return;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };
});

app.get("/api/v1/me/state", async (request, reply) => {
  const user = ensureAuthenticated(request, reply);
  if (!user) return;

  return {
    watchlist: store.getWatchlist(user.id),
    progress: store.getProgress(user.id)
  };
});

app.get("/api/v1/me/taste-graph", async (request, reply) => {
  const user = ensureAuthenticated(request, reply);
  if (!user) return;

  return computeTasteGraph({
    watchlist: store.getWatchlist(user.id),
    progress: store.getProgress(user.id)
  });
});

app.get("/api/v1/me/subscription", async (request, reply) => {
  const user = ensureAuthenticated(request, reply);
  if (!user) return;

  return {
    subscription: store.getSubscription(user.id)
  };
});

app.post<{ Body: SubscriptionBody }>("/api/v1/me/subscription", async (request, reply) => {
  const user = ensureAuthenticated(request, reply);
  if (!user) return;

  const plan = request.body?.plan;
  if (plan !== "monthly" && plan !== "yearly") {
    return reply.status(400).send({ error: "plan must be 'monthly' or 'yearly'" });
  }

  return {
    subscription: store.activateSubscription(user.id, plan)
  };
});

app.post("/api/v1/me/subscription/cancel", async (request, reply) => {
  const user = ensureAuthenticated(request, reply);
  if (!user) return;

  const current = store.getSubscription(user.id);
  if (!current) {
    return reply.status(404).send({ error: "No subscription found" });
  }

  return {
    subscription: store.cancelSubscription(user.id)
  };
});

app.get<{ Querystring: BillingHistoryQuery }>("/api/v1/me/billing/history", async (request, reply) => {
  const user = ensureAuthenticated(request, reply);
  if (!user) return;

  const limit = normalizeLimit(request.query.limit, 20, 1, 100);
  const status = request.query.status;
  const plan = request.query.plan;

  if (status && status !== "all" && status !== "paid" && status !== "failed") {
    return reply.status(400).send({ error: "status must be 'all', 'paid' or 'failed'" });
  }

  if (plan && plan !== "all" && plan !== "monthly" && plan !== "yearly") {
    return reply.status(400).send({ error: "plan must be 'all', 'monthly' or 'yearly'" });
  }

  return {
    items: store.getBillingHistory(user.id, {
      limit,
      status: status && status !== "all" ? status : undefined,
      plan: plan && plan !== "all" ? plan : undefined
    })
  };
});

app.post<{ Body: BillingCheckoutBody }>("/api/v1/me/billing/checkout", async (request, reply) => {
  const user = ensureAuthenticated(request, reply);
  if (!user) return;

  const plan = request.body?.plan;
  const paymentMethod = request.body?.paymentMethod ?? "card";

  if (plan !== "monthly" && plan !== "yearly") {
    return reply.status(400).send({ error: "plan must be 'monthly' or 'yearly'" });
  }

  if (paymentMethod !== "card" && paymentMethod !== "mobile_money" && paymentMethod !== "paypal") {
    return reply.status(400).send({ error: "paymentMethod must be 'card', 'mobile_money' or 'paypal'" });
  }

  const status: BillingTransactionStatus = request.body?.simulateFailure ? "failed" : "paid";
  const pricing = getPricingSnapshot();

  const result = store.checkoutSubscription({
    id: `txn-${randomUUID()}`,
    userId: user.id,
    plan,
    amountCents: pricing.amounts[plan],
    currency: pricing.currency,
    paymentMethod,
    status
  });

  if (status === "failed") {
    return reply.status(402).send({
      error: "Payment failed",
      transaction: result.transaction,
      subscription: result.subscription
    });
  }

  return reply.status(201).send({
    transaction: result.transaction,
    subscription: result.subscription,
    pricing
  });
});

app.get("/api/v1/me/watchlist", async (request, reply) => {
  const user = ensureAuthenticated(request, reply);
  if (!user) return;

  return {
    items: store.getWatchlist(user.id)
  };
});

app.post<{ Body: WatchlistBody }>("/api/v1/me/watchlist", async (request, reply) => {
  const user = ensureAuthenticated(request, reply);
  if (!user) return;

  const contentId = request.body?.contentId?.trim();
  if (!contentId) {
    return reply.status(400).send({ error: "contentId is required" });
  }

  store.addToWatchlist(user.id, contentId);
  return { items: store.getWatchlist(user.id) };
});

app.delete<{ Params: { contentId: string } }>("/api/v1/me/watchlist/:contentId", async (request, reply) => {
  const user = ensureAuthenticated(request, reply);
  if (!user) return;

  const contentId = request.params.contentId?.trim();
  if (!contentId) {
    return reply.status(400).send({ error: "contentId is required" });
  }

  store.removeFromWatchlist(user.id, contentId);
  return { items: store.getWatchlist(user.id) };
});

app.get("/api/v1/me/progress", async (request, reply) => {
  const user = ensureAuthenticated(request, reply);
  if (!user) return;

  return {
    items: store.getProgress(user.id)
  };
});

app.put<{ Params: { contentId: string }; Body: ProgressBody }>("/api/v1/me/progress/:contentId", async (request, reply) => {
  const user = ensureAuthenticated(request, reply);
  if (!user) return;

  const contentId = request.params.contentId?.trim();
  const progress = request.body?.progress;

  if (!contentId) {
    return reply.status(400).send({ error: "contentId is required" });
  }

  if (typeof progress !== "number" || Number.isNaN(progress)) {
    return reply.status(400).send({ error: "progress must be a number" });
  }

  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));
  store.setProgress(user.id, contentId, safeProgress);

  return {
    contentId,
    progress: safeProgress
  };
});

app.get<{ Querystring: CatalogEnrichedQuery }>("/api/v1/catalog/enriched", async (request) => {
  return {
    items: getUnifiedCatalog(request.query)
  };
});

app.get("/api/v1/catalog/moods", async () => {
  return {
    items: getMoodCatalog()
  };
});

app.get<{ Querystring: CatalogRecommendationQuery }>("/api/v1/catalog/recommendations", async (request) => {
  const limit = normalizeLimit(request.query.limit, 6, 1, 20);
  const mood = request.query.mood;

  const fromUnified = getUnifiedCatalog({ mood, limit: String(limit) });
  if (fromUnified.length > 0) {
    return { items: fromUnified };
  }

  return {
    items: getMoodRecommendations(mood, limit)
  };
});

app.get<{ Params: { contentId: string }; Querystring: StreamQuery }>("/api/v1/catalog/stream/:contentId", async (request, reply) => {
  const profile = request.query.profile ?? "auto";
  if (profile !== "auto" && profile !== "data_saver" && profile !== "high") {
    return reply.status(400).send({ error: "profile must be 'auto', 'data_saver' or 'high'" });
  }

  const stream = resolveStreamProfile(request.params.contentId, profile);
  if (stream) return stream;

  const item = getUnifiedCatalog({ limit: "200" }).find((entry) => entry.id === request.params.contentId);
  if (!item) {
    return reply.status(404).send({ error: "content not found" });
  }

  if (profile === "data_saver") {
    return {
      profile,
      maxResolution: "480p",
      maxBitrateKbps: 900,
      preloadSeconds: 2,
      hlsUrl: item.hlsUrl
    };
  }

  if (profile === "high") {
    return {
      profile,
      maxResolution: "1080p",
      maxBitrateKbps: 5500,
      preloadSeconds: 8,
      hlsUrl: item.hlsUrl
    };
  }

  return {
    profile: "auto",
    maxResolution: "720p",
    maxBitrateKbps: 2400,
    preloadSeconds: 4,
    hlsUrl: item.hlsUrl
  };
});

app.get("/api/v1/catalog", async () => {
  return {
    items: getUnifiedCatalog({ limit: "20" }).map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      year: item.year,
      status: item.status
    }))
  };
});

app.get("/api/v1/admin/stats", async (request, reply) => {
  const auth = ensureAdmin(request, reply);
  if (!auth) return;

  const counts = store.getActiveSubscriptionCounts();
  const pricing = getPricingSnapshot();
  const mrr = counts.monthly * (pricing.amounts.monthly / 100) + counts.yearly * (pricing.amounts.yearly / 1200);

  const pendingSubmissions = store.countSubmissionsByStatus("submitted") + store.countSubmissionsByStatus("under_review");

  return {
    totals: {
      users: store.countUsers(),
      activeSubscriptions: counts.monthly + counts.yearly,
      watchMinutesToday: 9320,
      pendingContents: pendingSubmissions
    },
    inbox: {
      messagesNew: store.countCollaboratorMessagesByStatus("new"),
      feedbackNew: store.countFeedbackByStatus("new")
    },
    revenue: {
      monthlyRecurringRevenue: Number(mrr.toFixed(2)),
      currency: pricing.currency
    }
  };
});

app.get<{ Querystring: AdminListQuery }>("/api/v1/admin/inbox/messages", async (request, reply) => {
  const auth = ensureAdmin(request, reply);
  if (!auth) return;

  const status = parseMessageStatus(request.query.status);
  if (request.query.status && !status) {
    return reply.status(400).send({ error: "invalid message status" });
  }

  const limit = normalizeLimit(request.query.limit, 50, 1, 200);
  return { items: store.getCollaboratorMessages(limit, status) };
});

app.patch<{ Params: { id: string }; Body: AdminUpdateMessageBody }>("/api/v1/admin/inbox/messages/:id", async (request, reply) => {
  const auth = ensureAdmin(request, reply);
  if (!auth) return;

  const status = request.body?.status;
  if (status !== "new" && status !== "reviewed" && status !== "contacted" && status !== "archived") {
    return reply.status(400).send({ error: "invalid status" });
  }

  const item = store.updateCollaboratorMessageStatus(request.params.id, status);
  if (!item) return reply.status(404).send({ error: "message not found" });

  writeAdminAudit({
    actor: auth,
    action: "MESSAGE_STATUS_UPDATED",
    entityType: "collaborator_message",
    entityId: item.id,
    payload: { status }
  });

  return { item };
});

app.get<{ Querystring: AdminListQuery }>("/api/v1/admin/feedback", async (request, reply) => {
  const auth = ensureAdmin(request, reply);
  if (!auth) return;

  const status = parseFeedbackStatus(request.query.status);
  if (request.query.status && !status) {
    return reply.status(400).send({ error: "invalid feedback status" });
  }

  const limit = normalizeLimit(request.query.limit, 50, 1, 200);
  return { items: store.getFeedback(limit, status) };
});

app.patch<{ Params: { id: string }; Body: AdminUpdateFeedbackBody }>("/api/v1/admin/feedback/:id", async (request, reply) => {
  const auth = ensureAdmin(request, reply);
  if (!auth) return;

  const status = request.body?.status;
  if (status !== "new" && status !== "reviewed" && status !== "featured" && status !== "archived") {
    return reply.status(400).send({ error: "invalid status" });
  }

  const item = store.updateFeedbackStatus(request.params.id, status);
  if (!item) return reply.status(404).send({ error: "feedback not found" });

  writeAdminAudit({
    actor: auth,
    action: "FEEDBACK_STATUS_UPDATED",
    entityType: "feedback",
    entityId: item.id,
    payload: { status }
  });

  return { item };
});

app.get<{ Querystring: AdminListQuery }>("/api/v1/admin/submissions", async (request, reply) => {
  const auth = ensureAdmin(request, reply);
  if (!auth) return;

  const status = parseSubmissionStatus(request.query.status);
  if (request.query.status && !status) {
    return reply.status(400).send({ error: "invalid submission status" });
  }

  const limit = normalizeLimit(request.query.limit, 100, 1, 200);
  return { items: store.getSubmissions(limit, status) };
});

app.patch<{ Params: { id: string }; Body: AdminUpdateSubmissionBody }>("/api/v1/admin/submissions/:id", async (request, reply) => {
  const auth = ensureAdmin(request, reply);
  if (!auth) return;

  const requestedStatus = request.body?.status;
  const publishToCatalog = request.body?.publishToCatalog === true;

  if (
    requestedStatus &&
    requestedStatus !== "submitted" &&
    requestedStatus !== "under_review" &&
    requestedStatus !== "approved" &&
    requestedStatus !== "rejected" &&
    requestedStatus !== "published"
  ) {
    return reply.status(400).send({ error: "invalid status" });
  }

  const finalStatus: SubmissionStatus = publishToCatalog ? "published" : requestedStatus ?? "under_review";
  const publishedCatalogId = finalStatus === "published" ? `community-${request.params.id.slice(-8)}` : null;

  const item = store.updateSubmission({
    id: request.params.id,
    status: finalStatus,
    publishedCatalogId
  });

  if (!item) return reply.status(404).send({ error: "submission not found" });

  writeAdminAudit({
    actor: auth,
    action: publishToCatalog ? "SUBMISSION_PUBLISHED" : "SUBMISSION_STATUS_UPDATED",
    entityType: "submission",
    entityId: item.id,
    payload: { status: finalStatus, publishedCatalogId }
  });

  return { item };
});

app.get<{ Querystring: AdminAuditQuery }>("/api/v1/admin/audit", async (request, reply) => {
  const auth = ensureAdmin(request, reply);
  if (!auth) return;

  const limit = normalizeLimit(request.query.limit, 100, 1, 500);
  return { items: store.getAdminAuditLogs(limit) };
});
app.get("/api/v1/admin/contents", async (request, reply) => {
  const auth = ensureAdmin(request, reply);
  if (!auth) return;

  const items = getUnifiedCatalog({ limit: "200" }).map((item) => ({
    id: item.id,
    title: item.title,
    type: item.type,
    status: item.status,
    source: item.id.startsWith("community-") ? "submission" : "catalog"
  }));

  return { items };
});

app.get("/api/v1/admin/studio/submissions", async (request, reply) => {
  const auth = ensureAdmin(request, reply);
  if (!auth) return;

  const limit = normalizeLimit((request.query as { limit?: string }).limit, 120, 1, 500);
  const status = (request.query as { status?: string }).status;
  return { items: studioStore.listSubmissions(limit, status) };
});

app.patch<{ Params: { id: string }; Body: { status?: string; adminNote?: string } }>("/api/v1/admin/studio/submissions/:id/status", async (request, reply) => {
  const auth = ensureAdmin(request, reply);
  if (!auth) return;

  const id = Number(request.params.id);
  if (!Number.isFinite(id)) return reply.status(400).send({ error: "invalid submission id" });

  const status = request.body?.status || "QC";
  const allowed = new Set(["UPLOADED", "QC", "DROITS", "VISA_HAAC", "PROGRAMME", "PUBLIE", "NEED_RESUBMIT", "QUARANTAINE"]);
  if (!allowed.has(status)) return reply.status(400).send({ error: "invalid status" });

  const item = studioStore.updateSubmissionStatus(id, status as any, request.body?.adminNote ?? null);
  if (!item) return reply.status(404).send({ error: "submission not found" });

  writeStudioAudit({
    actor: auth,
    action: "STUDIO_SUBMISSION_STATUS_UPDATED",
    entityType: "studio_submission",
    entityId: String(item.id),
    payload: { status, adminNote: request.body?.adminNote ?? null }
  });

  return { item };
});

app.get("/api/v1/admin/haac/queue", async (request, reply) => {
  const auth = ensureAdmin(request, reply);
  if (!auth) return;

  const limit = normalizeLimit((request.query as { limit?: string }).limit, 120, 1, 500);
  return { items: studioStore.listHaacQueue(limit) };
});

app.get<{ Params: { contentId: string } }>("/api/v1/admin/haac/flags/:contentId", async (request, reply) => {
  const auth = ensureAdmin(request, reply);
  if (!auth) return;

  return { items: studioStore.listFlags(request.params.contentId) };
});

app.post<{ Body: { contentId?: string; action?: "VISA_OK" | "+16" | "+18" | "REJETE_HAAC"; reason?: string; territory?: string[]; expiry?: string; revsharePct?: number; creatorName?: string } }>("/api/v1/admin/haac/visa", async (request, reply) => {
  const auth = ensureAdmin(request, reply);
  if (!auth) return;

  const contentId = request.body?.contentId?.trim();
  const action = request.body?.action;
  if (!contentId || !action) return reply.status(400).send({ error: "contentId and action are required" });

  const content = studioStore.getContent(contentId);
  if (!content) return reply.status(404).send({ error: "content not found" });

  if (action === "VISA_OK" && content.qcStatus !== "PASSED") {
    writeStudioAudit({
      actor: auth,
      action: "HAAC_VISA_BLOCKED_QC",
      entityType: "content",
      entityId: contentId,
      payload: { qcStatus: content.qcStatus }
    });
    return reply.status(409).send({ error: "QC must be PASSED before VISA_OK", qcStatus: content.qcStatus });
  }

  const next = studioStore.updateContentCompliance({
    id: contentId,
    haacStatus: action
  });

  const linkedSubmission = studioStore.listSubmissions(500).find((item) => item.contentId === contentId);
  if (linkedSubmission) {
    const nextStatus = action === "REJETE_HAAC" ? "QUARANTAINE" : "PROGRAMME";
    studioStore.updateSubmissionStatus(linkedSubmission.id, nextStatus as any, request.body?.reason ?? null);
  }

  if (action === "VISA_OK") {
    const territory = request.body?.territory && request.body.territory.length > 0 ? request.body.territory : ["BJ", "TG"];
    const expiry = request.body?.expiry || new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 2).toISOString().slice(0, 10);
    const revsharePct = Number.isFinite(request.body?.revsharePct as number) ? Number(request.body?.revsharePct) : content.revsharePct;
    const contractPath = resolve(projectRoot, "contracts", `${contentId}.pdf`);

    await writeSimpleContract({
      contractPath,
      creatorName: request.body?.creatorName || "Createur",
      title: content.title,
      territory,
      revsharePct,
      expiryDate: expiry
    });

    const rightsJson = JSON.stringify({ owner: content.creatorId, contract_url: contractPath, territory, expiry });
    studioStore.updateContentCompliance({ id: contentId, rightsJson });
  }

  writeStudioAudit({
    actor: auth,
    action: `HAAC_${action}`,
    entityType: "content",
    entityId: contentId,
    payload: { reason: request.body?.reason ?? null }
  });

  return { item: next };
});

app.post<{ Body: { contentId?: string; lang?: string } }>("/api/v1/admin/dub", async (request, reply) => {
  const auth = ensureAdmin(request, reply);
  if (!auth) return;

  if (!enableAiDub) {
    return reply.status(503).send({ error: "AI dub disabled" });
  }

  const contentId = request.body?.contentId?.trim();
  const lang = request.body?.lang?.trim().toLowerCase();
  const allowed = new Set(["fon", "mina", "yoruba", "dendi", "fr"]);

  if (!contentId || !lang || !allowed.has(lang)) {
    return reply.status(400).send({ error: "invalid contentId or lang" });
  }

  runBackground(async () => {
    await runDubPipeline(contentId, lang);
  });

  writeStudioAudit({
    actor: auth,
    action: "AI_DUB_QUEUED",
    entityType: "content",
    entityId: contentId,
    payload: { lang }
  });

  return reply.status(202).send({ status: "queued", contentId, lang });
});

app.get("/api/v1/admin/revenue/pending", async (request, reply) => {
  const auth = ensureAdmin(request, reply);
  if (!auth) return;

  return { items: studioStore.getRevenuePending() };
});

app.post<{ Body: { creatorId?: string } }>("/api/v1/admin/revenue/mark-paid", async (request, reply) => {
  const auth = ensureAdmin(request, reply);
  if (!auth) return;
  const creatorId = request.body?.creatorId?.trim();
  if (!creatorId) return reply.status(400).send({ error: "creatorId required" });

  studioStore.markCreatorPaid(creatorId);
  writeStudioAudit({
    actor: auth,
    action: "REVENUE_MARK_PAID",
    entityType: "creator",
    entityId: creatorId
  });

  return { ok: true };
});

app.get<{ Params: { contentId: string } }>("/api/v1/catalog/content/:contentId/meta", async (request, reply) => {
  const content = studioStore.getContent(request.params.contentId);
  if (!content) return reply.status(404).send({ error: "content not found" });
  return content;
});

const closeAndExit = (code: number) => {
  try {
    store.close();
  } finally {
    process.exit(code);
  }
};

process.on("SIGINT", () => closeAndExit(0));
process.on("SIGTERM", () => closeAndExit(0));

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  closeAndExit(1);
});





























