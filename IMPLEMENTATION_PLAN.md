# PRINTELLY Background Studio — plan d’implémentation

Branche de travail : `transferlab-background-studio`

Périmètre : TransferLab uniquement. La branche `main`, le site client et la branche historique `transferlab-autonome` ne sont pas modifiés.

## 1. Audit du socle hérité

### Composants stables à conserver

- Backend FastAPI existant sous `backend/app`.
- Session ONNX persistante chargée au démarrage par `LocalOnnxProvider`.
- Vérification optionnelle du SHA-256 du modèle.
- Exécution CPU ou CUDA explicite.
- Redimensionnement letterbox conservant les proportions.
- Pipeline `BackgroundRemovalPipeline` et export PNG RGBA.
- Préservation du canal alpha d’un fichier déjà détouré.
- Raffinement guidé, analyse des bords, connectivité, protection sémantique et mode fond noir.
- Validation des limites de taille, limitation de débit locale, délai maximal et nettoyage des fichiers temporaires.
- Images Docker backend/frontend exécutées sans privilèges supplémentaires.
- Prototype TransferLab responsive, calcul des dimensions, quantités et prix en DZD.

### Écarts avec le cahier des charges

- Le frontend est un document HTML/CSS/JS monolithique, pas Next.js/TypeScript/Tailwind.
- L’API historique `/api/remove-background` est synchrone et non versionnée.
- Absence de PostgreSQL, SQLAlchemy, Alembic, Redis, Celery/RQ, MinIO et reverse proxy complet.
- Absence d’upload multipart par morceaux, de file de travaux persistante et de progression SSE réelle.
- Absence de bibliothèque de designs, sessions invitées, comptes, commandes, livraison et tarification administrable.
- Absence d’éditeur de masque non destructif avec versions, opérations, undo/redo et contraintes utilisateur.
- Absence de préflight DTF complet, rapports, localisation des problèmes et exports asynchrones.
- Absence d’administration protégée et de journal d’audit.
- Détection automatique CUDA → DirectML → CPU non implémentée.
- Traitement tuilé/pyvips et gestion adaptative RAM/VRAM non implémentés.
- Le modèle ONNX n’est pas versionné dans Git et doit être monté au runtime avec son SHA-256.
- GitHub Pages ne peut héberger que l’aperçu statique ; le produit complet exige Docker sur une machine ou un serveur.

## 2. Architecture cible

```text
frontend/                 Next.js, TypeScript, Tailwind, React Query, Zustand, Konva
backend/app/
  api/v1/                 API versionnée
  core/                   configuration, sécurité, authentification, logs
  db/                     SQLAlchemy, session, migrations Alembic
  models/                 entités persistées
  schemas/                contrats Pydantic
  repositories/           accès aux données
  services/               orchestration métier
  ai/                     modules du pipeline BiRefNet
  workers/                tâches lourdes et progression
  storage/                stockage local/MinIO et URL signées
infra/                    Nginx, profils CPU/GPU, scripts
migrations/               migrations Alembic
tests/                    unitaires, API, intégration, sécurité, régression
```

Services Docker :

- `frontend` : application Next.js ;
- `api` : FastAPI sans inférence lourde dans le processus web ;
- `worker` : traitements IA et exports ;
- `postgres` : données métier et historiques ;
- `redis` : file, progression, cache et rate limiting ;
- `minio` : stockage objet local facultatif ;
- `nginx` : reverse proxy, limites d’upload et en-têtes de sécurité.

## 3. Invariants techniques

- Aucun fichier client envoyé à un service tiers.
- Aucun appel à une API payante de suppression de fond.
- Le modèle est chargé une fois par processus worker et réutilisé.
- Les dimensions originales et les pixels opaques sont préservés sauf action explicite.
- Toute transparence livrée est un véritable PNG RGBA ; aucun damier n’est exporté.
- Les opérations de masque sont non destructives, versionnées et rejouables.
- Les chemins internes ne sont jamais exposés.
- Les progressions proviennent des étapes réelles du job.
- Le SVG utilisateur n’est jamais rendu avant assainissement.
- Les suppressions logiques précèdent l’effacement définitif ; les actions sensibles sont auditées.

## 4. Phases d’implémentation

### Phase A — fondations

1. Créer le frontend Next.js avec routes studio, designs, commandes et administration.
2. Ajouter PostgreSQL/SQLAlchemy/Alembic, Redis/RQ et stockage sécurisé.
3. Introduire `/api/v1`, identifiants UUID, états de jobs et SSE.
4. Conserver `/api/remove-background` comme adaptateur de compatibilité.
5. Ajouter configuration centralisée, health checks et `.env.example` complet.

Critère : upload réel, enregistrement d’un asset, création d’un job et progression persistée.

### Phase B — moteur et éditeur

1. Séparer `FileValidator`, `ImageDecoder`, `BackgroundAnalyzer`, `BiRefNetSegmenter`, `TiledInferenceEngine`, `MaskComposer`, `ConnectedBackgroundDetector`, `ProtectedColorManager`, `EdgeRefiner`, `ColorDecontaminator`, `ResidueDetector`, `AlphaExporter`, `DTFPreflightAnalyzer` et `QualityScorer`.
2. Ajouter détection automatique des fournisseurs CUDA, DirectML puis CPU.
3. Ajouter aperçu rapide puis export original tuilé avec recouvrement.
4. Persister masque IA, masque courant, opérations et versions.
5. Construire l’éditeur Konva avec restaurer, effacer, protéger, gomme connectée, pipette, multipoints, lasso, undo/redo et raccourcis.

Critère : BiRefNet réel, correction manuelle rejouable, export RGBA exact.

### Phase C — DTF et commerce

1. Ajouter préflight DTF avec gravité, localisation et corrections explicites.
2. Ajouter dimensions, variantes, DPI réel, prix administrable et devis.
3. Ajouter bibliothèque, archivage, duplication, versions et réutilisation.
4. Ajouter panier/commandes, DZD, remises, options, 58 wilayas et paiements modulaires.
5. Ajouter vérification humaine et administration avec journal d’audit.

Critère : un résultat validé peut être téléchargé ou ajouté à une commande persistée.

### Phase D — durcissement et livraison

1. Upload par morceaux, validation signature/MIME, limites, SVG nettoyé et conversions isolées.
2. Tests unitaires, API, file, sécurité, frontend, E2E et régression des masques.
3. Docker Compose CPU/GPU, health checks, redémarrage, volumes et scripts.
4. README, documentation API, déploiement et dépannage Windows/WSL2.
5. CI de qualité et rapports de tests sans simulation de modèle.

Critère : stack complète démarrable par Docker Compose et tests principaux verts avec le modèle fourni.

## 5. Modèle de données initial

- `users`, `guest_sessions`, `assets`, `asset_versions`, `mask_versions`, `mask_operations` ;
- `processing_jobs`, `job_events`, `preflight_reports`, `exports` ;
- `price_rules`, `popular_sizes`, `quotes`, `orders`, `order_items`, `payments`, `deliveries` ;
- `human_reviews`, `notifications`, `feature_flags`, `audit_logs`.

Les objets binaires restent dans le stockage objet/local sécurisé ; PostgreSQL ne stocke que les métadonnées et clés internes.

## 6. Stratégie de tests

- Tests sans modèle : validation, sécurité, topologie, alpha, dimensions, DPI, tarification et API.
- Tests avec faux provider déterministe : orchestration du pipeline et états réels.
- Tests avec modèle BiRefNet monté : régression des 12 cas du cahier des charges.
- Tests E2E : import → traitement → correction → préflight → export/commande.
- Les tests dépendant du modèle sont marqués explicitement et échouent avec un message clair si le modèle ou son SHA-256 manque.

## 7. Risques et blocages connus

- Le fichier BiRefNet ONNX et son SHA-256 doivent être fournis au runtime ; ils ne seront pas téléchargés depuis une API tierce ni ajoutés au dépôt sans licence et validation.
- DirectML exige un runtime Windows adapté ; les conteneurs Linux utilisent CUDA ou CPU.
- PSD/AI/PDF demandent des convertisseurs isolés et ne seront acceptés que lorsque la conversion est vérifiable.
- GitHub Pages restera uniquement une vitrine ; l’IA, la base et le worker nécessitent une infrastructure exécutable.

## 8. Politique de livraison Git

- Tous les changements restent sur `transferlab-background-studio`.
- Aucun push sur `main`.
- Aucun déploiement public ni fusion sans validation du propriétaire.
- Les commits sont atomiques et associés à des tests ou vérifications identifiables.
