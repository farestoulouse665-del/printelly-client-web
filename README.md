# PRINTELLY Background Studio

> Supprimez le fond. Préservez le design. Imprimez sans erreur.

Cette branche contient le nouveau **TransferLab autonome** : une application séparée du site client PRINTELLY, avec Next.js, FastAPI, PostgreSQL, Redis/RQ et BiRefNet ONNX local.

- Branche de développement : `transferlab-background-studio`
- Branche d’origine conservée : `transferlab-autonome`
- Le site client sur `main` n’est pas modifié.
- Les images clients ne sont jamais envoyées à une API de détourage tierce.

## Capacités

- import direct ou par morceaux, jusqu’à 25 fichiers ;
- contrôle de la signature, du MIME, de la taille et des dimensions ;
- PNG, JPEG, WebP, TIFF, BMP, PDF/AI-PDF, SVG nettoyé et PSD ;
- file Redis/RQ avec progression réellement enregistrée et annulation ;
- session ONNX persistante, sélection CUDA → DirectML → CPU ;
- inférence BiRefNet par tuiles avec recouvrement pour les grandes images ;
- modes logo, cheveux, fonds blanc, noir, gris et coloré ;
- véritable PNG RGBA, éditeur non destructif, annuler/rétablir ;
- contrôle DTF de l’alpha, du DPI, des halos, détails et résidus ;
- tailles multiples, tarification DZD, commandes et 58 wilayas ;
- comptes scrypt, sessions signées et bibliothèque persistante ;
- administration, vérification humaine et purge automatique.

## Architecture

```text
Navigateur
   │
   ▼
Nginx :8080
   ├── Next.js :3000
   └── FastAPI :8000
          ├── PostgreSQL : métadonnées, versions, commandes, audit
          ├── Redis/RQ : file, annulation, progression
          ├── Worker CPU ou GPU : BiRefNet ONNX persistant
          ├── Volume privé : originaux, masques et exports
          └── Maintenance : rétention et suppression physique
```

L’API ne renvoie jamais de chemin interne. Les téléchargements utilisent une URL HMAC courte qui lie la clé, l’expiration et le nom de fichier.

## Prérequis

Sous Windows : Docker Desktop, WSL2, 16 Go de RAM recommandés et 20 Go libres. Le GPU NVIDIA est facultatif. Sous Linux : Docker Engine et Docker Compose v2.

## Installation

```powershell
git switch transferlab-background-studio
Copy-Item .env.example .env
```

Remplacer au minimum dans `.env` : `POSTGRES_PASSWORD`, `SIGNING_SECRET`, `ADMIN_TOKEN` et `BACKGROUND_MODEL_SHA256`. Ne jamais committer `.env`, le modèle ou des fichiers clients.

## Modèle BiRefNet local

Le modèle n’est volontairement pas stocké dans Git. Lire `MODEL_LICENSE.md` puis installer avec une empreinte approuvée :

```powershell
New-Item -ItemType Directory -Force models
python backend/scripts/install_model.py --sha256 VOTRE_SHA256_APPROUVE_DE_64_CARACTERES --accept-mit-license
python backend/scripts/verify_model.py --model models/background-removal.onnx --sha256 VOTRE_SHA256_APPROUVE_DE_64_CARACTERES --load
```

Aucun import client ne déclenche un téléchargement externe.

## Démarrage CPU

```powershell
.\scripts\start.ps1
```

Équivalent manuel :

```powershell
docker compose up -d --build
docker compose ps
```

- application : http://localhost:8080
- documentation API : http://localhost:8080/docs
- santé : http://localhost:8080/api/v1/health

## Démarrage GPU NVIDIA

Dans `.env` :

```dotenv
BACKGROUND_DEVICE=cuda
RQ_QUEUE_NAME=background-removal-gpu
```

Puis :

```powershell
.\scripts\start.ps1 -Gpu
```

Le script lance le worker GPU et désactive le worker CPU pour éviter deux chargements du modèle.

## Revenir au CPU

```dotenv
BACKGROUND_DEVICE=auto
RQ_QUEUE_NAME=background-removal
```

```powershell
docker compose --profile gpu down
.\scripts\start.ps1
```

Avec `auto`, le code choisit CUDA, DirectML puis CPU selon les providers réellement installés. Le conteneur Linux CPU fournit CPU ; le profil GPU fournit CUDA.

## Exploitation

Arrêter sans supprimer les volumes :

```powershell
.\scripts\stop.ps1
```

Voir les journaux :

```powershell
docker compose logs -f api worker frontend maintenance
docker compose logs --tail 200 worker
```

Migrations :

```powershell
docker compose exec api alembic upgrade head
docker compose exec api alembic current
```

Créer ou promouvoir un administrateur :

```powershell
docker compose exec api python scripts/create_admin.py --email admin@printelly.dz --name "Administrateur PRINTELLY"
```

Le mot de passe est demandé sans être affiché. L’accès technique à `/admin` utilise aussi `ADMIN_TOKEN`, distribué hors du dépôt.

Purge manuelle sûre :

```powershell
.\scripts\cleanup.ps1
```

Le service `maintenance` effectue déjà la purge périodiquement. Cette commande ne supprime aucun volume. `docker compose down --volumes` efface la base et les fichiers ; ne l’utiliser qu’après une décision explicite et une sauvegarde.

## Tests backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
alembic upgrade head
pytest -q --cov=app --cov-report=term-missing
```

PostgreSQL et Redis doivent correspondre à `DATABASE_URL` et `REDIS_URL`.

## Tests frontend

```powershell
cd frontend
npm install
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Validation Docker :

```powershell
docker compose config --quiet
docker compose build api frontend
```

GitHub Actions exécute les migrations PostgreSQL, les tests unitaires/API, la sécurité d’upload, les régressions de masque, le frontend, les parcours desktop/mobile et le build Docker.

## API v1

Principaux endpoints :

- `POST /api/v1/sessions/guest`
- `POST /api/v1/accounts/register`
- `POST /api/v1/accounts/login`
- `GET /api/v1/accounts/me`
- `POST /api/v1/assets/upload` et endpoints d’upload par morceaux
- `GET /api/v1/assets`
- `POST /api/v1/background-removal/jobs`
- `GET /api/v1/background-removal/jobs/{job_id}/events`
- `POST /api/v1/masks/{asset_id}/operations`
- `POST /api/v1/masks/{asset_id}/undo` et `redo`
- `POST /api/v1/preflight/analyze`
- `POST /api/v1/exports`
- `POST /api/v1/quotes`
- `POST /api/v1/orders`
- `GET /api/v1/admin/dashboard`

Swagger expose la spécification complète une fois le service démarré.

## Sécurité

Le projet contrôle le contenu réel avant décodage, limite poids et pixels, protège contre les bombes de décompression, nettoie les SVG, exécute les conversions sans shell dans un conteneur non privilégié, utilise des noms aléatoires et des URLs signées, protège les mots de passe avec scrypt, contrôle la propriété des designs, retire les métadonnées à l’export et ne journalise pas le contenu d’image.

Avant ouverture Internet : TLS, sauvegardes chiffrées, antivirus configuré, rotation des secrets et supervision externe sont obligatoires.

## Dépannage Windows, Docker et WSL2

Vérifier le moteur :

```powershell
wsl --status
wsl --update
docker version
docker compose version
```

Si le modèle est absent :

```powershell
Test-Path models/background-removal.onnx
docker compose exec worker ls -lh /models/background-removal.onnx
```

En cas de mémoire insuffisante : réduire `MAX_IMAGE_PIXELS` et `INFERENCE_TILE_SIZE`, conserver `MAX_CONCURRENT_JOBS=1`, augmenter la mémoire WSL2 et ne pas lancer les workers CPU et GPU ensemble. Les tuiles réduisent la mémoire d’inférence, mais le raffinement final manipule encore le masque original.

Si la progression reste en attente :

```powershell
docker compose ps
docker compose logs --tail 200 redis worker
```

Vérifier que `RQ_QUEUE_NAME` correspond à la file du worker.

## Pourquoi GitHub Pages renvoyait 404

Cette version n’est pas un sous-dossier statique `/transferlab/`. Elle requiert FastAPI, PostgreSQL, Redis, un worker ONNX et du stockage privé. GitHub Pages ne peut pas les exécuter. Il faut déployer la pile Docker sur un serveur derrière Nginx et TLS.

## Limites avant production publique

- fournir le modèle ONNX et son SHA-256 approuvé ;
- tester PDF, SVG, PSD et AI avec les fichiers réels de production ;
- configurer `ANTIVIRUS_COMMAND` pour activer l’antivirus ;
- connecter l’adaptateur de paiement en ligne choisi ;
- l’amélioration 2×/4× reste conservatrice et non générative ;
- faire valider humainement les transparences artistiques et cas extrêmes.

Voir [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) pour l’audit et les décisions.
