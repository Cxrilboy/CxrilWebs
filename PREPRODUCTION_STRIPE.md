# Préparation de production — 14 octobre 2026

Le code est préparé localement. Aucun déploiement, commit ou push n'a été effectué.

## Isolation de la préproduction

- Domaine dédié, servi à la racine de son propre dossier (les pages appellent `/api/...` en chemin absolu) ; jamais dans le dossier de cxrilwebs.fr.
- `config/.env` propre à la préproduction : clé Stripe de test, secret de webhook de l'endpoint de test, base Supabase de test, SMTP de test. Ne rien recopier depuis la production.
- `APP_URL` = adresse de la préproduction : l'origine des requêtes et les adresses de retour Stripe en dépendent.
- Ne pas déposer le `.htaccess` public (il redirige tout vers https://cxrilwebs.fr) : utiliser un gabarit dont le domaine canonique est celui de la préproduction, avec `X-Robots-Tag: noindex` et un `robots.txt` qui interdit tout.
- Les pages `admin/*.html` contiennent l'adresse et la clé anonyme de la base de production : les remplacer par celles de la base de test avant de tester l'administration.
- Base de test : structure restaurée sans données clients (`pg_restore --schema-only --schema=public --no-owner --no-privileges`), puis migration. Une restauration d'essai de la sauvegarde du 14/10/2026 a restauré la structure publique à l'identique ; aucune donnée client n'est nécessaire en préproduction.
- Endpoint Stripe de test dédié ; ne pas modifier l'endpoint qui pointe vers le site public.

## Ordre de déploiement

1. Sauvegarder les fichiers réellement déployés sur o2switch et réaliser une sauvegarde Supabase restaurable. Les copies locales ne remplacent pas cette sauvegarde.
2. Créer une préproduction avec une base de test et des clés Stripe de test. Adapter APP_URL et la redirection canonique .htaccess à son domaine : la configuration publique redirige vers cxrilwebs.fr. Conserver les secrets uniquement côté serveur.
3. Appliquer migrations/20261014_stripe_billing.sql dans la base de préproduction. Elle crée quatre tables et deux fonctions RPC ; elle ne modifie pas les tables historiques de paiements et devis.
4. Déployer les fichiers modifiés et api/stripe-billing.php ensemble, avec les dépendances PHP existantes. Ne pas remplacer config/.env ni vendor par le contenu de cette copie locale. Ne pas publier les tests, les migrations ou les rapports sous une URL publique.
5. Activer les 15 événements ci-dessous sur l'endpoint de préproduction après la migration et le déploiement. Utiliser le secret de signature propre à cet endpoint.
6. Exécuter en ligne de commande, depuis le projet : php scripts/stripe-preflight.php. Ce contrôle est en lecture seule et masque les secrets. Il vérifie les Price IDs réellement configurés, les tables et les événements. Le conserver hors accès web.
7. Effectuer les tests de bout en bout ci-dessous. Enregistrer les identifiants de sessions, événements et factures ainsi que les résultats.
8. Une fois la préproduction validée, appliquer le même ordre en production après sauvegarde : migration, code, événements. Vérifier la configuration de production avec php scripts/stripe-preflight.php --allow-live (lecture seule). Ne pas recopier de clés de test vers la production.

## Événements Stripe

- checkout.session.completed
- checkout.session.async_payment_succeeded
- checkout.session.async_payment_failed
- checkout.session.expired
- charge.refunded
- customer.subscription.created
- customer.subscription.updated
- customer.subscription.deleted
- customer.subscription.paused
- customer.subscription.resumed
- invoice.paid
- invoice.payment_failed
- invoice.payment_action_required
- invoice.voided
- invoice.marked_uncollectible

## Recette obligatoire en préproduction

- Paiement ponctuel réussi, refusé, annulé et session expirée ; devis avec options et acompte exact.
- Basic, Plus et Maintenance mensuelle : paiement initial, renouvellement, échec de renouvellement puis régularisation, annulation immédiate et en fin de période.
- Maintenance ponctuelle 80 EUR et annuelle 1 490 EUR : paiement unique, sans renouvellement.
- Rejouer un événement et livrer un événement ancien après un récent : aucune ligne de facture dupliquée ni retour à un ancien état.
- Signature webhook invalide refusée ; incident Supabase entraînant une erreur puis reprise réussie par Stripe.
- Vérifier merci.html, courriels et administration historique. Le nouveau suivi des abonnements est enregistré en base ; aucune nouvelle interface d'administration n'a été ajoutée.
- Application, publicité, devis social personnalisé avec options mensuelles et Express avec pages supplémentaires : aucun Checkout autorisé.

## Données et retour arrière

Les tables stripe_subscriptions et stripe_subscription_invoices suivent l'état courant. stripe_billing_events déduplique les événements et stripe_billing_locks sérialise les traitements. Toutes sont réservées au rôle serveur service_role, avec séparation test/production par livemode. Les montants sont en centimes.

Le paiement initial peut apparaître dans le suivi historique et dans la première facture d'abonnement : ne pas additionner les deux tables pour calculer le chiffre d'affaires. L'annulation d'un abonnement n'annule pas ses factures déjà payées.

En cas de retour arrière, suspendre les dix nouveaux événements de suivi, restaurer les fichiers sauvegardés ensemble et conserver les tables ajoutées. Garder les événements en échec pour reprise après correction ; vérifier les événements manqués dans Stripe. Ne pas supprimer des données de paiement pour revenir à l'ancien code.

Stripe ne garantit pas l'ordre de livraison : le nouveau traitement relit l'état courant via l'API sous verrou, puis enregistre l'événement et l'état dans une transaction. Référence : [webhooks Stripe](https://docs.stripe.com/webhooks).

## État des accès

L'endpoint de test actuellement visible pointe sur le site public et ne reçoit que checkout.session.completed et checkout.session.async_payment_succeeded. Il n'a pas été modifié. La préproduction et l'accès Supabase ne sont pas disponibles dans cette session. Les secrets et éventuels Price IDs configurés sur o2switch ne peuvent donc pas encore être validés.

