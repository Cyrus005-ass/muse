# Muse Streaming Platform (MVP)

Plateforme complete Muse Origin Studio avec:
- front utilisateur (`apps/web`)
- back-office admin (`apps/admin`)
- API metier (`apps/api`)
- app mobile Expo (`apps/mobile`)

Le projet est valide en mode MVP deployable (build + smoke test passes).

## Stack
- Web/Admin: Next.js 15 + React 18
- API: Fastify + TypeScript + SQLite
- Mobile: Expo + React Native
- Monorepo: npm workspaces

## MVP scope livre
- Auth utilisateur/admin (register/login/me)
- Catalogue et detail contenu (HLS)
- Watchlist + progression de lecture
- Abonnement et historique de paiement (simules)
- MoodEngine + recommandations
- Formulaires publics (messages, feedback, soumissions)
- Studio uploader + pipeline HAAC/QC (local)
- Admin moderation (soumissions/messages/feedback/audit)
- Admin HAAC (visa, classification, rejet, doublage IA)
- Admin revenus createurs (pending + mark paid)

## Prerequis
- Node.js 20+
- npm 10+
- ffmpeg installe (pour pipeline media local)

## Installation
```bash
npm install
cp .env.example .env
```

## Variables d'environnement (minimum prod)
Verifier au moins ces variables:
- `NODE_ENV=production`
- `API_PORT=4000`
- `DB_PATH=./data/muse.db`
- `JWT_SECRET=<secret-long-aleatoire>`
- `ADMIN_EMAIL=<email-admin>`
- `ADMIN_PASSWORD=<mot-de-passe-fort>`
- `NEXT_PUBLIC_API_URL=https://api.votredomaine.com`
- `EXPO_PUBLIC_API_URL=https://api.votredomaine.com`
- `CORS_ORIGINS=https://app.votredomaine.com,https://admin.votredomaine.com`

## Lancement dev
Ouvrir 3 terminaux minimum:
```bash
npm run dev:api
npm run dev:web
npm run dev:admin
```
Option mobile:
```bash
npm run dev:mobile
```

## Verification complete MVP
1. Verifier le typage/lint:
```bash
npm run lint
```
2. Verifier les builds:
```bash
npm run build
```
3. Smoke test bout-en-bout (API + web + admin deja lances):
```bash
npm run smoke
```

## Run production
Construire puis lancer:
```bash
npm run build
npm run start:api
npm run start:web
npm run start:admin
```

Ports par defaut:
- API: `4000`
- Web: `3000`
- Admin: `3001`

## Reverse proxy (recommande)
Publier avec Nginx/Caddy:
- `api.votredomaine.com` -> `localhost:4000`
- `app.votredomaine.com` -> `localhost:3000`
- `admin.votredomaine.com` -> `localhost:3001`

## Endpoints de sante
- API: `GET /health`
- Web/Admin: `GET /` (utilises par smoke)

## Donnees et persistence
- Base SQLite: `data/muse.db`
- Fichiers media: `storage/`
- Contrats: `contracts/`

Sauvegarder regulierement:
- `data/muse.db`
- `storage/`
- `contracts/`

## Commandes utiles
```bash
npm run smoke
```

## Checklist go-live
- [ ] `JWT_SECRET` fort et unique
- [ ] mot de passe admin change
- [ ] CORS restreint (`CORS_ORIGINS`)
- [ ] HTTPS actif sur les 3 domaines
- [ ] backup sqlite + storage planifie
- [ ] `npm run build` OK
- [ ] `npm run smoke` OK (avec API/Web/Admin actifs)
- [ ] monitoring de base (logs API + uptime)

## Notes HAAC
Le module HAAC est decrit dans `README_HAAC.md` (workflow QC, quarantaine, visa, audit).