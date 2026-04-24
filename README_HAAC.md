# README_HAAC

## Objectif
Ce module applique un controle de conformite HAAC Benin avant toute publication catalogue.

## Regles appliquees
- Tout contenu charge passe par QC automatique, transcription, scan HAAC, puis validation admin.
- Si doute de conformite (violence forte, religion, politique sensible, NSFW), statut `QUARANTAINE`.
- Aucun contenu en `QUARANTAINE` ou `REJETE_HAAC` ne doit etre publie.
- Seul un admin peut appliquer `VISA_OK`, `+16`, `+18` ou `REJETE_HAAC`.
- Toute action admin est tracee dans `admin_audit_logs`.

## Pipeline
1. `POST /creator/submit` (multipart) : video + poster + contrat.
2. HLS auto (`ffmpeg`) dans `storage/hls/{content_id}`.
3. QC (`tools/qc.py`) : codec, bitrate, ratio, duree, LUFS.
4. Sous-titres VO (`tools/whisper_srt.py`) si absents.
5. Scan HAAC (`tools/haac_scanner.py`) + insertion `content_flags`.
6. Decision auto:
   - `VISA_OK` si aucun risque
   - `+16` / `+18` selon severite
   - `QUARANTAINE` en cas de risque eleve

## Validation admin
- Endpoint `POST /api/v1/admin/haac/visa`.
- Actions possibles: `VISA_OK`, `+16`, `+18`, `REJETE_HAAC`.
- `VISA_OK` genere un contrat de diffusion local dans `contracts/{content_id}.pdf`.

## Dubbing IA local
- Endpoint `POST /api/v1/admin/dub`.
- Langues: Fon, Mina, Yoruba, Dendi.
- Utilise exclusivement des outils locaux (Ollama/XTTS/Wav2Lip ou fallback local).

## Traçabilite
Chaque operation admin critique est loggee avec:
- `actor_user_id`
- `actor_email`
- `action`
- `entity_type`
- `entity_id`
- `payload_json`
- `created_at`

## Bonnes pratiques conformite
- Toujours verifier les flags avant validation.
- Appliquer `+16/+18` quand necessaire.
- Motiver chaque rejet dans `reason`.
- Conserver les contrats et droits en local.
