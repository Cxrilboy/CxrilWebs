<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/bootstrap.php';

cx_require_post();
cx_require_same_origin();
cx_enforce_rate_limit('checkout', 10, 3600);
$payload = cx_json_payload(5000);
$priceKey = cx_clean_text($payload['priceKey'] ?? '', 80, true);

// Le navigateur n'envoie jamais de montant : cette liste constitue l'unique source de prix côté serveur.
$catalog = [
    'web_express' => ['name' => 'Acompte — Site Express', 'amount' => 87, 'mode' => 'payment', 'record' => 'acompte', 'env' => 'STRIPE_PRICE_WEB_EXPRESS_DEPOSIT'],
    'web_vitrine' => ['name' => 'Acompte — Site Vitrine', 'amount' => 267, 'mode' => 'payment', 'record' => 'acompte', 'env' => 'STRIPE_PRICE_WEB_VITRINE_DEPOSIT'],
    'web_ecommerce' => ['name' => 'Acompte — Site E-commerce', 'amount' => 507, 'mode' => 'payment', 'record' => 'acompte', 'env' => 'STRIPE_PRICE_WEB_ECOMMERCE_DEPOSIT'],
    'maintenance_site_ponctuel' => ['name' => 'Maintenance Site Web — Intervention ponctuelle', 'amount' => 80, 'mode' => 'payment', 'record' => 'unique', 'env' => 'STRIPE_PRICE_MAINTENANCE_ONESHOT'],
    'maintenance_site_mensuel' => ['name' => 'Maintenance Site Web — Mensuel', 'amount' => 150, 'mode' => 'subscription', 'record' => 'abonnement', 'recurring' => ['interval' => 'month'], 'env' => 'STRIPE_PRICE_MAINTENANCE_MONTHLY'],
    'maintenance_site_annuel' => ['name' => 'Maintenance Site Web — Annuel', 'amount' => 1490, 'mode' => 'payment', 'record' => 'unique', 'env' => 'STRIPE_PRICE_MAINTENANCE_YEARLY'],
    'rs_basic' => ['name' => 'Gestion Réseaux Sociaux — Basic', 'amount' => 160, 'mode' => 'subscription', 'record' => 'abonnement', 'recurring' => ['interval' => 'month'], 'env' => 'STRIPE_PRICE_SOCIAL_BASIC_MONTHLY'],
    'rs_plus' => ['name' => 'Gestion Réseaux Sociaux — Plus', 'amount' => 320, 'mode' => 'subscription', 'record' => 'abonnement', 'recurring' => ['interval' => 'month'], 'env' => 'STRIPE_PRICE_SOCIAL_PLUS_MONTHLY'],
    'rs_facebook' => ['name' => 'Création Page Facebook', 'amount' => 120, 'mode' => 'payment', 'record' => 'unique', 'env' => 'STRIPE_PRICE_SOCIAL_FACEBOOK'],
    'rs_instagram' => ['name' => 'Création Compte Instagram', 'amount' => 100, 'mode' => 'payment', 'record' => 'unique', 'env' => 'STRIPE_PRICE_SOCIAL_INSTAGRAM'],
    'rs_tiktok' => ['name' => 'Création Page TikTok', 'amount' => 150, 'mode' => 'payment', 'record' => 'unique', 'env' => 'STRIPE_PRICE_SOCIAL_TIKTOK'],
    'rs_linkedin' => ['name' => 'Création Page LinkedIn', 'amount' => 80, 'mode' => 'payment', 'record' => 'unique', 'env' => 'STRIPE_PRICE_SOCIAL_LINKEDIN'],
    'rs_ads' => ['name' => 'Campagnes publicitaires Facebook & Instagram', 'amount' => 400, 'mode' => 'payment', 'record' => 'unique', 'env' => 'STRIPE_PRICE_SOCIAL_ADS'],
];

if (!isset($catalog[$priceKey])) {
    cx_json(422, ['ok' => false, 'error' => 'Formule de paiement inconnue.']);
}
if (cx_env('STRIPE_SECRET_KEY') === '') {
    cx_json(503, ['ok' => false, 'error' => 'Le paiement sécurisé est momentanément indisponible.']);
}

$product = $catalog[$priceKey];
$configuredPrice = cx_env($product['env']);
// Une ancienne configuration peut encore contenir le placeholder de l'exemple.
// Dans ce cas, utiliser les tarifs serveur, comme pour une variable vide.
if ($configuredPrice === 'price_...') {
    $configuredPrice = '';
}
if ($configuredPrice !== '' && !preg_match('/^price_[A-Za-z0-9]+$/D', $configuredPrice)) {
    cx_log('Identifiant Price invalide pour ' . $priceKey);
    cx_json(503, ['ok' => false, 'error' => 'La configuration de cette formule doit être vérifiée.']);
}
$lineItem = $configuredPrice !== ''
    ? ['price' => $configuredPrice, 'quantity' => 1]
    : [
        'price_data' => array_filter([
            'currency' => 'eur',
            'product_data' => ['name' => $product['name']],
            'unit_amount' => $product['amount'] * 100,
            'recurring' => $product['recurring'] ?? null,
        ]),
        'quantity' => 1,
    ];

try {
    cx_require_composer();
    $httpClient = new \Stripe\HttpClient\CurlClient();
    $httpClient->setConnectTimeout(5);
    $httpClient->setTimeout(20);
    \Stripe\ApiRequestor::setHttpClient($httpClient);
    $stripe = new \Stripe\StripeClient(cx_env('STRIPE_SECRET_KEY'));
    $session = $stripe->checkout->sessions->create([
        'mode' => $product['mode'],
        'line_items' => [$lineItem],
        // La formule (clé du catalogue, déjà validée côté serveur) ne sert qu'à personnaliser le texte :
        // seul le webhook Stripe fait foi pour confirmer un paiement.
        'success_url' => cx_app_url() . '/merci.html?session_id={CHECKOUT_SESSION_ID}&formula=' . rawurlencode($priceKey),
        'cancel_url' => cx_app_url() . '/paiement.html',
        'locale' => 'fr',
        'metadata' => [
            'price_key' => $priceKey,
            'product_name' => $product['name'],
            'payment_record_mode' => $product['record'],
        ],
    ]);
} catch (Throwable $exception) {
    cx_log('Création de session Stripe impossible : ' . $exception->getMessage());
    cx_json(502, ['ok' => false, 'error' => 'Impossible de préparer le paiement sécurisé.']);
}

cx_json(200, ['ok' => true, 'url' => $session->url, 'session_id' => $session->id]);
