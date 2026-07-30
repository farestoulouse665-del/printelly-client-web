# TransferLab — plan d’implémentation

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

- Le mode local ne transmet aucun fichier client à un tiers.
- PhotoRoom et remove.bg sont des options explicites : elles ne sont appelées que lorsque le fournisseur correspondant est configuré, avec avertissement visible dans l’interface.
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


## 9. État d’implémentation au 29 juillet 2026

### Réalisé sur la branche isolée

- Frontend Next.js/TypeScript, parcours en trois étapes, bibliothèque, compte, commande et administration.
- API FastAPI `/api/v1`, PostgreSQL/SQLAlchemy, deux migrations Alembic, Redis/RQ et SSE.
- BiRefNet ONNX persistant avec priorité CUDA/DirectML/CPU et inférence tuilée.
- Analyse de fond, fond noir, protection sémantique, raffinements et vrai export RGBA.
- Éditeur Konva non destructif, versions, annulation/rétablissement et outils connectés.
- Préflight DTF, sous-couche informative, PNG, masque alpha, JPG d’aperçu, PDF, rapport JSON et ZIP.
- Comptes scrypt, sessions signées, rattachement des designs et actions de bibliothèque.
- Devis DZD, commandes, options de paiement modulaires et livraison 58 wilayas.
- Administration, audit, vérification humaine, heartbeat worker et maintenance de rétention.
- Docker Compose CPU/GPU, Nginx, scripts Windows/WSL2, README et CI.

### Validation écrite mais non encore déclarée verte

- Tests historiques du pipeline, du fond noir et de la préservation alpha.
- Tests du tuilage, des URL signées, de l’éditeur, du DPI, des exports et de la validation MIME.
- Test d’intégration PostgreSQL/Redis : invité → upload → compte → reconnexion → bibliothèque → job → annulation.
- Tests Vitest des unités physiques et DPI.
- Tests Playwright desktop/mobile et invariants visuels.
- Workflow GitHub Actions pour migrations, pytest, lint, TypeScript, Vitest, build Next, Playwright et Docker.

Les résultats ne seront inscrits comme « réussis » qu’après réception effective d’un run GitHub Actions. Le modèle ONNX réel reste un prérequis séparé pour les régressions d’inférence.


## 10. Revue de durcissement finale

La revue statique de livraison a ajouté les garanties suivantes :

- rejet de la résolution avant décodage complet afin de limiter les bombes de décompression et pics mémoire ;
- aperçu navigateur limité au raster de travail validé, les sources SVG/PDF/PSD/AI restant privées ;
- adresse de rate limiting fournie uniquement par le proxy Nginx de confiance ;
- profil ICC conservé dans les exports PNG lorsqu’il est présent ;
- devis lié aux dimensions, quantités, variantes et options exactes ; toute altération lors de la commande est refusée ;
- frais de livraison calculés exclusivement par les règles serveur ;
- totalité des profils IA et des variantes lasso exposée dans l’interface.

La branche contient le workflow de validation complet, mais le connecteur disponible ne remonte pas les exécutions déclenchées par `push`. L’environnement Windows local refuse aussi l’exécution du shell par sa politique ACL. En conséquence, aucun test n’est déclaré réussi sans résultat GitHub Actions observable. La PR reste volontairement en brouillon et aucun déploiement ou merge n’a été effectué.


## 11. Façade autonome « légendaire » — 30 juillet 2026

### Réalisé

- remplacement de l’accueil e-commerce par une façade TransferLab autonome sans inscription, panier ni administration visibles ;
- conservation du backend, des jobs RQ, des URLs signées et des 13 profils fonctionnels ;
- affichage automatique du résultat traité dans le panneau gauche sans navigation vers une autre page ;
- chargement de l’aperçu traité en Blob, renouvellement de l’URL signée en cas d’expiration et bascule Original/Résultat ;
- téléchargement direct du PNG transparent final ;
- calcul du DPI réel à partir des pixels et d’une largeur d’impression réglable avec ratio verrouillé ;
- intégration de l’éditeur de masque Konva dans la même façade, avec versions, annulation et rétablissement ;
- synchronisation de chaque nouvelle version manuelle avec l’aperçu principal et le bouton de téléchargement ;
- identité visuelle premium responsive dédiée à TransferLab ;
- adaptation du test Playwright desktop/mobile au parcours autonome ;
- documentation des modes local, PhotoRoom et remove.bg sans inclure aucune clé.

### Vérification disponible

- revue statique des fichiers mis à jour et contrôle des imports/états ;
- workflow GitHub Actions toujours présent pour TypeScript, ESLint, Vitest, build Next.js, Playwright, pytest et Docker ;
- aucun résultat de test n’est déclaré réussi tant qu’une exécution CI observable ou une exécution Docker locale n’a pas été reçue.

### Périmètre préservé

- modifications limitées à `transferlab-background-studio` ;
- aucune modification de `main` ni du site client PRINTELLY ;
- anciennes routes conservées pour la compatibilité des données et de l’API, mais absentes de la navigation principale.
