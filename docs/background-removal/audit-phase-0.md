# Audit Phase 0 — PRINTELLY Background Removal Studio

Date : 2026-07-29  
Branche auditée : `feat/local-ai-background-removal`  
État stable de départ : `a1bff45b3e3b5f5f1e10bccdb290e8a2eb5aaa04`  
Workflow stable de référence : GitHub Actions run `30478735141` (workflow nº 459)

## 1. Résumé exécutif

Le dépôt contient déjà un produit fonctionnel, pas un prototype vide : frontend statique,
éditeur de masque non destructif, backend FastAPI, modèle BiRefNet ONNX local, export PNG
RGBA, profils de fond noir, contrôles DTF, Docker non-root et tests CI.

Le défaut architectural le plus rentable à corriger en premier était l'identification du
fond uniforme. Cette logique était privée dans `mask_refinement.py`, utilisait la médiane
de tous les pixels du bord et pouvait donc être contaminée lorsqu'un sujet touchait le
cadre. La Phase 0 introduit un `BackgroundAnalyzer` modulaire derrière un feature flag,
sans supprimer l'ancien pipeline.

## 2. Stack et architecture constatées

- Frontend : HTML/CSS/JavaScript sans framework, canvas et modules globaux spécialisés.
- Validation frontend : TypeScript `checkJs` et tests Node.
- Backend : Python 3.11, FastAPI, Pillow, OpenCV, NumPy et ONNX Runtime.
- Modèle : BiRefNet ONNX monté en lecture seule dans Docker.
- Exécution : Docker Compose, backend non-root, système de fichiers en lecture seule,
  répertoire temporaire `tmpfs`.
- Authentification métier : Supabase côté application cliente.
- Publication : frontend Nginx avec proxy `/api/` vers FastAPI.
- CI : deux jobs indépendants, backend Pytest et frontend typecheck/tests.

## 3. Parcours exact d'une image

| Étape | Responsable | Entrée | Sortie | Risque principal |
|---|---|---|---|---|
| Sélection | `background-remover.js` | File navigateur | image décodée | MIME navigateur non fiable |
| Requête | `background-removal-api.js` | FormData | POST multipart | interruption navigateur non coopérative |
| Parsing | `api/background.py` | multipart | UploadFile | stockage temporaire Starlette |
| Validation | `image_validation.py` | flux | ValidatedImage | bombe de décompression / permissions |
| Mode | `mode_detection.py` | PIL Image | profil effectif | classification heuristique |
| Inférence | `local_onnx_provider.py` | RGB normalisé | masque float32 | provider, mémoire, sortie incompatible |
| Analyse du fond | `background_analysis.py` ou ancien fallback | image + masque | région de fond connectée | sujet touchant le bord |
| Raffinement | `mask_refinement.py` | masque + image | alpha raffiné | détails fins / trous légitimes |
| Fond noir | `black_background.py` | luminance + sémantique | alpha protégé | ambiguïté noir sur noir |
| Export | `image_export.py` | image + alpha | PNG RGBA | halo / alpha prémultiplié |
| Réponse | `api/background.py` | PNG + rapport | octets + headers | erreurs non entièrement structurées |
| Édition | `background-remover.js` | résultat | corrections de masque | mémoire et historique |
| Export DTF | `background-print-export.js` | canvas + paramètres | PNG + pHYs | distinction DPI/rééchantillonnage |

## 4. Baseline reproductible disponible

### CI stable avant changement

Le run GitHub Actions `30478735141` est terminé avec succès :

- job `backend` : installation Python 3.11 puis `python -m pytest -q` réussi ;
- job `frontend` : `npm run typecheck` et `npm run test:frontend` réussis.

### Comportement du moteur avant changement

- Le modèle est chargé une fois pendant le lifespan FastAPI.
- Le pipeline ne recharge pas la session ONNX par requête.
- Le temps total est mesuré et retourné dans `X-Processing-Ms`.
- Les temps par étape, le pic mémoire, p95/p99 et le warm-up ne sont pas encore mesurés.
- CUDA doit être demandé explicitement ; il n'existe pas encore de sélection automatique
  multi-provider ni de fallback silencieux vers CPU.
- L'annulation frontend interrompt la requête, mais le thread d'inférence lancé par
  `asyncio.to_thread` n'est pas annulé de façon coopérative.

### Limite de mesure

Le modèle ONNX et le poste Docker de production ne sont pas accessibles depuis
l'environnement d'exécution de cet audit. Aucun temps CPU/GPU ou chiffre mémoire réel
n'est donc inventé. La prochaine mesure doit être lancée sur la machine PRINTELLY avec le
modèle approuvé et enregistrer le matériel, le provider, la résolution et les temps par
étape.

## 5. Points forts conservés

- validation par signature et décodage réel ;
- limite de taille et de pixels ;
- correction EXIF ;
- conservation d'un alpha source réellement utile ;
- modèle monté en lecture seule et hash vérifié ;
- utilisateur Docker non-root ;
- `tmpfs` isolé avec `TMPDIR` explicite ;
- sémaphore de traitement ;
- export PNG RGBA sans damier ;
- protection spécialisée du fond noir ;
- outils manuels annulables ;
- contrôles de dimensions/DPI ;
- fallback complet vers l'ancien analyseur.

## 6. Problèmes classés

### Critiques

1. `/api/remove-background` ne valide pas encore de JWT Supabase. Avec Tailscale Funnel
   public, la limitation locale par IP n'est pas une isolation utilisateur.
2. Il n'existe pas encore de dataset visuel licencié avec masques de référence ; les
   gains de qualité réels ne peuvent pas être certifiés globalement.

### Importants

1. L'ancien échantillonnage utilise tout le bord et peut intégrer le sujet.
2. La logique d'analyse du fond était couplée au raffinement.
3. Le endpoint de santé ne distingue pas live, ready et model.
4. Pas de warm-up ONNX ni de métriques détaillées.
5. Pas d'annulation coopérative de l'inférence.
6. Erreurs API non versionnées et non structurées par code stable.
7. L'accès CUDA échoue au lieu d'utiliser un fallback CPU documenté.

### Secondaires

- configuration typée sans validation de plage complète ;
- tests backend concentrés sur pipeline/export/fond noir/mode ;
- aucun benchmark programmé ;
- aucun artifact CI avant/après.

## 7. Première amélioration intégrée

Le nouveau `BackgroundAnalyzer` :

- ignore les zones sémantiques du sujet lors de l'échantillonnage du bord ;
- construit une référence Lab robuste ;
- calcule une confiance et une couverture du bord ;
- confirme le fond par connectivité au bord ;
- bloque l'expansion sur les contours forts ;
- protège les régions de couleur identique enfermées dans le sujet ;
- produit une carte de risque interne ;
- conserve l'ancien algorithme si le flag est désactivé.

Activation Docker :

```env
BACKGROUND_PIPELINE_V2_ENABLED=true
```

Rollback immédiat :

```env
BACKGROUND_PIPELINE_V2_ENABLED=false
```

puis reconstruire uniquement le backend.

## 8. Tests de non-régression ajoutés

Cas synthétiques sans données client :

1. fond blanc connecté et blanc intérieur protégé ;
2. sujet touchant le bord sans contamination de la référence ;
3. sujet sombre protégé sur fond noir ;
4. activation V2 explicite et retour possible au pipeline V1.

Ces tests complètent les tests existants, sans remplacer la future validation visuelle.

## 9. Priorités suivantes

1. Faire passer la CI de cette modification.
2. Ajouter une authentification backend adaptée au mode public, sans casser le mode local.
3. Ajouter instrumentation par étape et script de benchmark réel.
4. Constituer le dataset privé autorisé et calculer les métriques avant/après.
5. Ajouter warm-up, provider réel enregistré et fallback CPU.
6. Étendre le V2 aux cartes de risque visibles dans l'interface.
7. Implémenter ensuite les profils fond blanc, cheveux/fourrure, halos et résidus avec
   seuils de non-régression.
