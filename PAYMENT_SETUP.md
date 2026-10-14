# Paiements et formulaires sur o2switch

Le site utilise maintenant des API PHP placées dans `api/`. Copie `.env.example` sous `config/.env`, complète les valeurs, puis installe les dépendances PHP avant le transfert :

```bash
composer install --no-dev --optimize-autoloader
```

`SMTP_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET` restent exclusivement dans `config/.env`. Ils ne doivent jamais être ajoutés à une page HTML, à JavaScript ou à Git.

## Stripe

Dans Stripe, crée un endpoint de webhook à l'adresse suivante :

```text
https://cxrilwebs.fr/api/stripe-webhook.php
```

Abonne cet endpoint aux événements `checkout.session.completed` et `checkout.session.async_payment_succeeded`, puis reporte la signature reçue dans `STRIPE_WEBHOOK_SECRET`.

Les variables `STRIPE_PRICE_*` sont facultatives. Sans elles, l'API PHP utilise la grille de prix côté serveur ; avec elles, elle emploie les Price IDs Stripe associés aux offres.

## Supabase

Supabase reste utilisé par l'administration existante pour suivre les contacts, devis et paiements. L'envoi d'email ne dépend pas de Supabase : une panne ponctuelle de la synchronisation ne bloque pas un formulaire déjà transmis par email. Configure les politiques RLS de ton projet Supabase afin que seule la clé `service_role`, conservée dans `config/.env`, puisse écrire via les API PHP.
