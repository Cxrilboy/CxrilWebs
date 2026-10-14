# Déploiement de CxrilWebs sur o2switch

## 1. Préparer le domaine

1. Dans cPanel, rattache `cxrilwebs.fr` au dossier web prévu pour le domaine.
2. Fais pointer les DNS du domaine vers o2switch, y compris `www`.
3. Active le certificat SSL/AutoSSL pour `cxrilwebs.fr` et `www.cxrilwebs.fr` avant de publier les fichiers. Le fichier `.htaccess` redirige ensuite automatiquement HTTP et `www` vers `https://cxrilwebs.fr`.

## 2. Installer les dépendances PHP

Le site est statique : il n'y a ni build Vite ni commande `npm run build`. Seules les API PHP ont des dépendances.

Depuis le dossier racine du domaine en SSH, avec PHP 8.1 minimum (PHP 8.2 recommandé) :

```bash
composer install --no-dev --optimize-autoloader
```

Cette commande crée le dossier `vendor/`. Si SSH/Composer n'est pas disponible, exécute cette commande sur une machine avec PHP et Composer, puis transfère aussi le dossier `vendor/`.

## 3. Configurer les secrets côté serveur

Crée `config/.env` à partir de `.env.example`, directement sur o2switch. Ne dépose jamais ce fichier dans Git ou dans une archive publique.

Renseigne au minimum :

```text
APP_URL=https://cxrilwebs.fr
CONTACT_TO_EMAIL=votre-adresse-de-reception
MAIL_FROM_EMAIL=votre-adresse-o2switch@cxrilwebs.fr
SMTP_HOST=valeur-affichee-dans-cPanel
SMTP_PORT=465
SMTP_ENCRYPTION=ssl
SMTP_USERNAME=votre-adresse-o2switch@cxrilwebs.fr
SMTP_PASSWORD=mot-de-passe-de-la-boite-email
```

Pour préserver l'administration, ajoute aussi `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`. Pour les paiements, ajoute `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET`.

## 4. Transférer les fichiers

Envoie le contenu de ce dossier, et non le dossier lui-même, à la racine web associée à `cxrilwebs.fr`. On doit y retrouver directement :

```text
index.html
.htaccess
api/
config/
vendor/
css, JavaScript, logos et autres assets
robots.txt
sitemap.xml
404.html
```

N'envoie pas `.git/`, `node_modules/`, ni un éventuel fichier `.env` placé à la racine. `config/.env` est créé manuellement sur le serveur.

## 5. Services externes

- Pour Stripe et Supabase, suivre [PREPRODUCTION_STRIPE.md](PREPRODUCTION_STRIPE.md) : sauvegarde, recette isolée, migration, code puis activation des 15 événements. Conserver les endpoints et secrets distincts entre test et production.
- Dans Supabase, conserve les politiques RLS : seule la clé `service_role`, utilisée par les API PHP, doit pouvoir effectuer les écritures serveur.
- Dans cPanel, crée l'adresse expéditrice puis relève les paramètres dans **Email Accounts → Connect Devices**. L'adresse expéditrice doit normalement être la même que `SMTP_USERNAME`.

## 6. Contrôle après publication

1. Ouvre `http://cxrilwebs.fr` et `http://www.cxrilwebs.fr` : les deux doivent finir sur `https://cxrilwebs.fr`.
2. Vérifie une page de service, le devis, le paiement, le mode sombre et le mobile.
3. Envoie un contact et un devis de test : vérifie le message de succès, l'email reçu et la synchronisation Supabase.
4. Lance un paiement Stripe en mode test, puis vérifie le webhook et la ligne de paiement dans l'administration.
5. Ouvre `https://cxrilwebs.fr/robots.txt` et `https://cxrilwebs.fr/sitemap.xml`.
