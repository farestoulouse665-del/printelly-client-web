# Plan d’implémentation — Packs Studio IA et paiement CCP

## État analysé

- Frontend statique GitHub Pages en HTML, CSS et JavaScript.
- Authentification Supabase partagée via `printelly_session`.
- Profils clients dans `public.profiles` avec rôle `client` ou administrateur.
- Commandes DTF existantes dans `orders`, `order_items` et `order_events` : elles restent inchangées.
- TransferLab appelle `printelly-background-removal`, qui conserve la clé PhotoRoom dans les secrets Supabase.
- Stockage existant privé `order-files`.

## Architecture retenue

Le commerce Studio IA est isolé dans les tables préfixées `studio_` afin de ne pas mélanger les packs numériques avec les commandes de production DTF.

1. `studio_plans` : packs dynamiques administrés en base.
2. `studio_payment_methods` : coordonnées CCP/BaridiMob configurables.
3. `studio_orders` : commandes avec référence et copie figée du pack.
4. `studio_payment_proofs` : historique des justificatifs et empreinte SHA-256.
5. `studio_subscriptions` : droits actifs et dates de validité.
6. `studio_credit_wallets`, `studio_credit_batches`, `studio_credit_transactions` : solde, lots et journal immuable.
7. `studio_image_jobs` : réservation, consommation ou remboursement d’un crédit.
8. `studio_notifications`, `studio_admin_actions`, `studio_security_logs` : suivi client et audit.
9. Bucket privé `studio-payment-proofs` : aucun justificatif public.

## Invariants de sécurité

- Une preuve envoyée ne déclenche jamais l’activation.
- Seul un administrateur reconnu par `is_printelly_admin()` peut approuver.
- L’approbation, l’abonnement et l’ajout des crédits sont une transaction PostgreSQL unique.
- Les crédits sont réservés avant PhotoRoom, consommés après un PNG valide et remboursés en cas d’échec.
- Les fonctions sensibles sont réservées au rôle serveur.
- Le frontend ne décide jamais des droits ni du solde.
- Les packs, prix, CCP et limites ne sont jamais codés en dur dans l’interface.

## Interface

- `/studio-packs/` : packs, commande CCP, preuve, chronologie, abonnement et utilisation.
- `/studio-admin/` : configuration des packs/CCP et file de paiements à vérifier.
- TransferLab affiche le solde réel et renvoie vers les packs lorsque l’accès est bloqué.

## Validation

- Contrôle du schéma, des RLS et des fonctions atomiques.
- Tests SQL transactionnels et d’idempotence.
- Vérification syntaxique JavaScript/TypeScript par la CI.
- Audit Supabase sécurité et performance après migration.
- Pull Request séparée, sans fusion automatique.
