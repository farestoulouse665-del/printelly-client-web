# PRINTELLY Client — détourage sémantique local

Cette version remplace la suppression de couleur par une segmentation réelle du sujet. Le
frontend existant reste statique. Un serveur Python privé exécute BiRefNet avec ONNX Runtime,
raffine le masque puis retourne un PNG RGBA dans les dimensions originales.

Aucune API d'image payante, aucun crédit, aucune clé commerciale et aucun envoi vers un
fournisseur tiers ne sont nécessaires. Le logiciel fonctionne sur CPU. Le logiciel est
gratuit; la machine, l'électricité, le VPS éventuel et son trafic ne le sont pas forcément.

## Architecture

```text
Navigateur PRINTELLY
  -> validation immédiate du type/taille
  -> POST multipart vers le serveur privé
FastAPI
  -> vérification MIME + signature + décodage + limites
  -> LocalOnnxProvider (BiRefNet chargé une fois)
  -> masque sémantique du premier plan
  -> protection des objets, textes, logos et couleurs internes
  -> détection structurelle des fonds unis connectés aux bords
  -> estimation de la couleur réelle du fond depuis les bords
  -> récupération du matte alpha (voiles blancs, noirs ou colorés)
  -> protection sémantique des micro-détails et couleurs identiques au fond
  -> affinage alpha guidé par les contours et décontamination localisée
  -> fusion avec l'alpha déjà présent
  -> vérification du PNG RGBA
  -> suppression du fichier temporaire
Navigateur
  -> aperçu, masque, contours, zones ambiguës
  -> scanner de résidus (voiles, bords reliés, petits fragments)
  -> guidage manuel intelligent à 8 directions avec zone de sécurité
  -> corrections alpha non destructives
  -> téléchargement ou ajout à une commande
```

L'interface fournisseur dans `backend/app/providers/base.py` permet de remplacer BiRefNet
sans réécrire l'API ni le pipeline.

## Installation du modèle

Le modèle n'est pas dans Git et n'est jamais téléchargé automatiquement.

1. Lire `MODEL_LICENSE.md` et `THIRD_PARTY_LICENSES.md`.
2. Télécharger depuis la release officielle BiRefNet `v1` l'artefact
   `BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx`.
3. Calculer et approuver son SHA-256, puis conserver cette empreinte avec votre version de
   déploiement.
4. Placer le fichier sous `models/background-removal.onnx`.
5. Reporter l'empreinte dans `.env` sous `BACKGROUND_MODEL_SHA256`.

L'installateur explicite accepte aussi une URL contrôlée :

```bash
python backend/scripts/install_model.py --sha256 VOTRE_SHA256 --accept-mit-license
```

Ne renseignez jamais une empreinte copiée depuis le fichier qui vient d'être téléchargé
sans contrôle de provenance : elle protégerait seulement contre une modification ultérieure.

### Empreinte sous Windows

```powershell
Get-FileHash .\models\background-removal.onnx -Algorithm SHA256
```

### Empreinte sous Linux

```bash
sha256sum models/background-removal.onnx
```

## Démarrage Docker

Copier la configuration et renseigner l'empreinte :

```bash
cp .env.example .env
docker compose up --build
```

Sous Windows PowerShell :

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Ouvrir ensuite http://localhost:8080. L'API est également disponible à
http://localhost:8000/api/health et http://localhost:8000/api/remove-background.

Le conteneur du modèle est monté en lecture seule, le processus Python est non-root et les
uploads utilisent un `tmpfs` éphémère.

## Démarrage sans Docker

### Linux / macOS

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export BACKGROUND_MODEL_PATH="$(pwd)/../models/background-removal.onnx"
export BACKGROUND_MODEL_SHA256="VOTRE_SHA256"
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
```

Servir le frontend depuis la racine dans un second terminal :

```bash
python3 -m http.server 8080
```

### Windows PowerShell

```powershell
Set-Location backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:BACKGROUND_MODEL_PATH=(Resolve-Path ..\models\background-removal.onnx)
$env:BACKGROUND_MODEL_SHA256="VOTRE_SHA256"
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
```

Puis, depuis la racine dans un autre terminal :

```powershell
py -m http.server 8080
```

Ouvrir http://localhost:8080 et garder `http://localhost:8000` dans le champ « Adresse du
serveur ».

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---:|---|
| `BACKGROUND_MODEL_PATH` | `/models/background-removal.onnx` | chemin du poids ONNX |
| `BACKGROUND_MODEL_SHA256` | vide | empreinte vérifiée; obligatoire dans Docker |
| `BACKGROUND_MODEL_NAME` | `BiRefNet-general-tiny` | nom remonté au frontend |
| `BACKGROUND_DEVICE` | `cpu` | `cpu` ou `cuda` |
| `BACKGROUND_MODEL_INPUT_SIZE` | `1024` | repli si la forme ONNX est dynamique |
| `MAX_UPLOAD_MB` | `50` | limite de taille |
| `MAX_IMAGE_PIXELS` | `40000000` | limite de résolution |
| `TEMP_DIR` | `/tmp/background-removal` | stockage temporaire |
| `TEMP_TTL_SECONDS` | `900` | nettoyage des fichiers orphelins |
| `RATE_LIMIT_PER_MINUTE` | `10` | limite locale par IP |
| `MAX_CONCURRENT_JOBS` | `1` | protège la mémoire CPU |
| `REQUEST_TIMEOUT_SECONDS` | `300` | délai maximal |
| `CORS_ORIGINS` | origines locales + site PRINTELLY | liste séparée par virgules |
| `ONNX_INTRA_OP_THREADS` | `0` | réglage automatique ONNX |
| `ENABLE_API_DOCS` | `false` | active `/docs` en développement |
| `TRUST_PROXY_HEADERS` | `false` | fait confiance à `X-Forwarded-For` seulement derrière un proxy contrôlé |

Pour le GPU, installer `backend/requirements-gpu.txt` dans un environnement compatible
CUDA/CuDNN et définir `BACKGROUND_DEVICE=cuda`. Le CPU reste la configuration de référence.

## Sécurité et confidentialité

- PNG, JPEG et WebP seulement, contrôlés par MIME, signature et décodage Pillow.
- 50 Mo et 40 mégapixels par défaut.
- noms de sortie neutralisés et temporaires aléatoires;
- rate limiting local, un traitement CPU concurrent, délai et annulation côté navigateur;
- origines CORS explicites;
- aucune image dans les journaux;
- temporaires supprimés dans un bloc `finally` et nettoyage des orphelins au démarrage;
- réponses et API non mises en cache par le service worker;
- secrets et poids absents du frontend.

Pour un accès public, placez le serveur derrière HTTPS (Caddy, nginx ou un reverse proxy
équivalent), gardez une seule instance par volume de modèle et configurez
`CORS_ORIGINS`. Le site GitHub Pages ne peut pas héberger Python : un serveur joignable est
donc nécessaire pour les visiteurs publics.

## Tests

```bash
cd backend
pytest -q
cd ..
npm install --ignore-scripts
npm run typecheck
npm run test:frontend
```

La CI exécute les tests sans poids ONNX grâce à un fournisseur factice. Elle couvre la
validation, le nettoyage en erreur, la conservation des dimensions/RGB, l'alpha existant sans nouvelle segmentation,
le fond noir avec design blanc, les couleurs de fond présentes dans un sujet protégé,
les designs multicolores, les halos blancs issus d'un ancien fond, les micro-détails,
la récupération des couleurs de bord, le score de résidus, le pipeline, les en-têtes de
sécurité, le client typé et le cache PWA.

Les 20 images de recette ne sont pas fournies pour des raisons de droit et de
confidentialité. Leur convention et les mesures attendues sont décrites dans
`backend/tests/fixtures/README.md`. Elles doivent être ajoutées avec consentement avant de
valider visuellement un modèle réel.

## Performances et mémoire

Le poids ONNX tiny fait environ 200 Mo. Une image RGBA de 40 mégapixels représente environ
160 Mo par tampon non compressé; la concurrence par défaut est donc limitée à un traitement.
L'aperçu navigateur est limité à 1400 × 1000, tandis que l'export utilise la résolution
originale. Les corrections haute résolution ne sont matérialisées qu'à l'export.

Aucune durée CPU universelle n'est annoncée : elle dépend fortement du processeur, de la
mémoire et de l'implémentation ONNX. Le serveur renvoie `X-Processing-Ms`; l'interface
affiche cette mesure réelle. Effectuez la recette des 20 images sur la machine cible avant
production.

## Limites connues

- si le sujet et le fond sont rasterisés de façon strictement identique sans contour,
  texture ni contexte, aucun modèle ne peut retrouver une information absente;
- un JPEG aplati ne contient pas de vraie transparence : elle est estimée;
- le modèle tiny privilégie le CPU et peut être moins précis que les variantes plus lourdes;
- la récupération de matte est conservatrice; utilisez le niveau « Fort » et, si nécessaire,
  la couleur de fond forcée pour un ancien fond blanc/noir particulièrement tenace;
- la décontamination modifie uniquement le RGB des pixels semi-transparents du bord; le centre
  du sujet et ses couleurs restent inchangés;
- le guidage manuel actuel combine couleur, proximité et topologie à 8 directions dans une
  zone de sécurité; une ambiguïté sémantique extrême peut encore nécessiter le pinceau
  Protéger/Effacer ou un futur second modèle interactif;
- la recette visuelle réelle reste obligatoire pour les vêtements, cheveux, dentelles,
  voiles, verre, ombres et designs propres à PRINTELLY.

## TransferLab sur GitHub Pages sans Docker

La façade publique reste statique sur GitHub Pages. La clé PhotoRoom ne doit
jamais être placée dans `app.js`, `background-removal-api.js` ou un secret
GitHub injecté dans le build : tout JavaScript livré au navigateur est public.

L’intégration de production utilise la fonction Supabase :

```text
https://jitxplfujyypfepiajgz.supabase.co/functions/v1/printelly-background-removal
```

Parcours :

1. le client se connecte à son espace PRINTELLY ;
2. le navigateur appelle la fonction avec son JWT Supabase ;
3. la fonction vérifie l’origine, la session, le débit, le poids et la signature du fichier ;
4. la clé Live est lue uniquement depuis les secrets Supabase ;
5. PhotoRoom retourne un PNG RGBA ;
6. TransferLab affiche le résultat et conserve les outils de correction locale.

Secret obligatoire à créer dans **Supabase → Edge Functions → Secrets** :

```dotenv
PHOTOROOM_API_KEY=VOTRE_CLE_LIVE
```

Secret facultatif :

```dotenv
PHOTOROOM_HOURLY_LIMIT=5
```

La limite publique actuelle est de 10 Mo et 6 000 pixels sur le côté le plus
large. Le quota est consulté via l’endpoint de compte PhotoRoom et affiché
uniquement à un client PRINTELLY authentifié. Les fichiers ne sont pas stockés
par la fonction. Aucun Docker Desktop n’est nécessaire pour le site public.

La source versionnée du proxy se trouve dans
`supabase/functions/printelly-background-removal/index.ts`. Aucun fichier
`.env` ni aucune clé PhotoRoom ne doit être commité.

