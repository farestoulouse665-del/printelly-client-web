# PRINTELLY Client — TransferLab Studio IA

Le site public reste un frontend statique GitHub Pages. En production, TransferLab appelle
une Edge Function Supabase authentifiée qui protège la clé PhotoRoom, vérifie le pack actif,
réserve un crédit, valide le PNG retourné puis consomme ou restitue le crédit de façon
atomique. Le backend Python/BiRefNet présent dans ce dépôt reste une option locale autonome.

## Architecture de production

```text
Compte PRINTELLY authentifié
  -> /studio-packs/ : catalogue dynamique, commande CCP, preuve privée
  -> printelly-studio-billing : autorisation, validation MIME, stockage signé
  -> administrateur /studio-admin/ : vérification explicite
  -> transaction PostgreSQL : abonnement + lot de crédits + journal d'audit
  -> /background-studio/ : contrôle du pack et des limites
  -> réservation atomique d'un crédit
  -> PhotoRoom Remove Background via secret Supabase
  -> validation du vrai PNG et des dimensions
  -> succès : consommation définitive et coût 6,8 DZD enregistré
  -> échec : crédit restitué; aucune consommation définitive
```

Aucun secret privilégié n'est présent dans le frontend. Les justificatifs sont placés dans
le bucket privé `studio-payment-proofs` et ne sont ouverts que par URL signée temporaire.

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



## Packs Studio IA et paiement CCP

Pages :

- `/studio-packs/` : packs actifs, portefeuille, commandes, preuve et historique.
- `/studio-admin/` : packs, coordonnées CCP et file de validation protégée par le rôle administrateur.
- `/background-studio/` : TransferLab avec solde réel et consommation des crédits.

Configuration initiale :

1. Se connecter avec le compte administrateur PRINTELLY.
2. Ouvrir `/studio-admin/`.
3. Créer au moins un pack actif et disponible à la vente.
4. Ajouter et activer les coordonnées CCP.
5. Vérifier côté client que le pack apparaît dans `/studio-packs/`.

Le client crée ensuite une commande `SAI-AAAA-000001`, paie, puis téléverse un véritable
JPG, PNG ou PDF. L'envoi d'une preuve place seulement la commande dans
`proof_received`. Il ne crée ni abonnement ni crédit. Seule l'action administrateur
« Accepter le paiement » exécute la transaction atomique d'activation.

### États et garanties

- commandes : `pending_payment`, `proof_received`, `under_review`,
  `additional_proof_required`, `paid`, `rejected`, `expired`, etc.;
- double validation bloquée par clé d'idempotence et verrouillage de ligne;
- copie figée du pack enregistrée dans chaque commande;
- expiration automatique exécutée chaque heure par `pg_cron`;
- justificatifs privés, signature SHA-256 et détection du MIME réel;
- fonctions sensibles exécutables uniquement par `service_role`;
- un traitement réussi consomme un crédit; un échec technique le restitue;
- si le pack expire pendant un traitement, le crédit échoué devient expiré et n'est jamais ressuscité.

### Déploiement Supabase

Les fichiers de référence sont dans :

```text
supabase/migrations/20260730090000_studio_ai_ccp_packs.sql
supabase/migrations/20260730090100_schedule_studio_expiry.sql
supabase/migrations/20260730090200_studio_ai_credit_expiry_hardening.sql
supabase/migrations/20260730090300_studio_ai_fk_indexes.sql
supabase/functions/printelly-studio-billing/index.ts
supabase/functions/printelly-background-removal/index.ts
```

Les Edge Functions exigent un JWT valide. Les secrets `PHOTOROOM_API_KEY`,
`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` restent exclusivement côté Supabase.

### Validation frontend

```bash
node --check background-removal-api.js
node --check studio-billing-api.js
node --check studio-credit-badge.js
node --check studio-packs/app.js
node --check studio-admin/app.js
```

La GitHub Action exécute ces contrôles sur chaque pull request et ne déploie GitHub Pages
que depuis `main`.
