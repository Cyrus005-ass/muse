#!/usr/bin/env node

const API_URL = process.env.SMOKE_API_URL || "http://localhost:4000";
const WEB_URL = process.env.SMOKE_WEB_URL || "http://localhost:3000";
const ADMIN_URL = process.env.SMOKE_ADMIN_URL || "http://localhost:3001";

function fail(message) {
  throw new Error(message);
}

async function request(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      "Content-Type": init.body ? "application/json" : (init.headers || {})["Content-Type"]
    }
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return { res, data };
}

async function checkHttp(url) {
  const res = await fetch(url);
  if (!res.ok) fail(`HTTP check failed for ${url} (${res.status})`);
}

async function main() {
  const stamp = Date.now();
  const email = `smoke-${stamp}@muse.local`;
  const password = "Smoke@1234";

  console.log("[smoke] checking api health...");
  await checkHttp(`${API_URL}/health`);

  console.log("[smoke] checking web/admin availability...");
  await checkHttp(WEB_URL);
  await checkHttp(ADMIN_URL);

  console.log("[smoke] register user...");
  const register = await request(`${API_URL}/api/v1/auth/register`, {
    method: "POST",
    body: JSON.stringify({ name: "Smoke User", email, password })
  });
  if (!register.res.ok || !register.data?.token) fail("register failed");
  const userToken = register.data.token;

  console.log("[smoke] user state + watchlist + progress + billing...");
  const me = await request(`${API_URL}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${userToken}` } });
  if (!me.res.ok) fail("auth/me failed");

  const watchAdd = await request(`${API_URL}/api/v1/me/watchlist`, {
    method: "POST",
    headers: { Authorization: `Bearer ${userToken}` },
    body: JSON.stringify({ contentId: "film-001" })
  });
  if (!watchAdd.res.ok) fail("watchlist add failed");

  const progress = await request(`${API_URL}/api/v1/me/progress/film-001`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${userToken}` },
    body: JSON.stringify({ progress: 42 })
  });
  if (!progress.res.ok) fail("progress update failed");

  const taste = await request(`${API_URL}/api/v1/me/taste-graph`, { headers: { Authorization: `Bearer ${userToken}` } });
  if (!taste.res.ok) fail("taste graph failed");

  const checkout = await request(`${API_URL}/api/v1/me/billing/checkout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${userToken}` },
    body: JSON.stringify({ plan: "monthly", paymentMethod: "card" })
  });
  if (!checkout.res.ok) fail("checkout failed");

  console.log("[smoke] public collaboration endpoints...");
  const msg = await request(`${API_URL}/api/v1/public/messages`, {
    method: "POST",
    body: JSON.stringify({
      name: "Smoke Collaborator",
      email: `collab-${stamp}@muse.local`,
      organization: "Smoke Studio",
      interestArea: "co-production",
      message: "Nous voulons collaborer sur un long-metrage panafricain."
    })
  });
  if (!msg.res.ok || !msg.data?.item?.id) fail("public message failed");

  const fb = await request(`${API_URL}/api/v1/public/feedback`, {
    method: "POST",
    body: JSON.stringify({
      name: "Smoke Viewer",
      email: `feedback-${stamp}@muse.local`,
      rating: 5,
      comment: "Super MVP, navigation claire et rapide."
    })
  });
  if (!fb.res.ok || !fb.data?.item?.id) fail("public feedback failed");

  const submission = await request(`${API_URL}/api/v1/public/submissions`, {
    method: "POST",
    body: JSON.stringify({
      creatorName: "Smoke Creator",
      creatorEmail: `creator-${stamp}@muse.local`,
      title: `Projet Smoke ${stamp}`,
      type: "film",
      synopsis: "Un projet de test pour verifier le workflow editorial.",
      pitch: "Pitch de test complet pour smoke test automation."
    })
  });
  if (!submission.res.ok || !submission.data?.item?.id) fail("public submission failed");

  console.log("[smoke] admin login + moderation...");
  const adminLogin = await request(`${API_URL}/api/v1/auth/login`, {
    method: "POST",
    body: JSON.stringify({ email: "admin@muse.local", password: "Admin@1234" })
  });
  if (!adminLogin.res.ok || !adminLogin.data?.token) fail("admin login failed");
  const adminToken = adminLogin.data.token;

  const submissionsList = await request(`${API_URL}/api/v1/admin/submissions?limit=50`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  if (!submissionsList.res.ok) fail("admin submissions list failed");

  const createdSubmission = submissionsList.data?.items?.find((x) => x.id === submission.data.item.id);
  if (!createdSubmission) fail("created submission not found in admin list");

  const publish = await request(`${API_URL}/api/v1/admin/submissions/${createdSubmission.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ publishToCatalog: true, status: "published" })
  });
  if (!publish.res.ok) fail("admin publish failed");

  const audit = await request(`${API_URL}/api/v1/admin/audit?limit=20`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  if (!audit.res.ok || !Array.isArray(audit.data?.items)) fail("admin audit failed");

  console.log("[smoke] all checks passed");
}

main().catch((error) => {
  console.error("[smoke] failed:", error.message);
  process.exit(1);
});