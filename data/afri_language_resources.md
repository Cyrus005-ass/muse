# Afri Language Resources

This local bundle prioritizes Fon, Mina, Yoruba, and Dendi.

## Usage
- Translation glossary path: `./data/glossaire_fr_fon.csv`
- AI dubbing supported target languages: `fon`, `mina`, `yoruba`, `dendi`
- Voice models expected in `MODELS_PATH`:
  - `fon_female.pth`
  - `mina_male.pth`
  - `yoruba_female.pth` (optional)
  - `dendi_male.pth` (optional)

## Integration
- Backend endpoint `POST /api/v1/admin/dub` accepts the above languages.
- Studio uploader supports original language metadata.
- Player fetches available audio tracks from `GET /api/v1/catalog/audio/:contentId`.
