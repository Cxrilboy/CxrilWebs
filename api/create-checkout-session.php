<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/bootstrap.php';

cx_require_post();
cx_require_same_origin();
cx_enforce_rate_limit('checkout', 10, 3600);
$payload = cx_json_payload(5000);
$priceKey = cx_clean_text($payload['priceKey'] ?? '', 80, true);

// Le navigateur n'envoie jamais de montant : cette liste constitue l'unique source de prix côté serveur.
// Création de site : 'total' est le prix du projet en euros ; l'acompte (30 %) est calculé plus bas, en centimes.
$catalog = [
    'web_express' => ['name' => 'Acompte — Site Express', 'total' => 290, 'mode' => 'payment', 'record' => 'acompte', 'env' => 'STRIPE_PRICE_WEB_EXPRESS_DEPOSIT'],
    'web_vitrine' => ['name' => 'Acompte — Site Vitrine', 'total' => 890, 'mode' => 'payment', 'record' => 'acompte', 'env' => 'STRIPE_PRICE_WEB_VITRINE_DEPOSIT'],
    'web_ecommerce' => ['name' => 'Acompte — Site E-commerce', 'total' => 1690, 'mode' => 'payment', 'record' => 'acompte', 'env' => 'STRIPE_PRICE_WEB_ECOMMERCE_DEPOSIT'],
    'maintenance_site_ponctuel' => ['name' => 'Maintenance Site Web — Intervention ponctuelle', 'amount' => 80, 'mode' => 'payment', 'record' => 'unique', 'env' => 'STRIPE_PRICE_MAINTENANCE_ONESHOT'],
    'maintenance_site_mensuel' => ['name' => 'Maintenance Site Web — Mensuel', 'amount' => 150, 'mode' => 'subscription', 'record' => 'abonnement', 'recurring' => ['interval' => 'month'], 'env' => 'STRIPE_PRICE_MAINTENANCE_MONTHLY'],
    'maintenance_site_annuel' => ['name' => 'Maintenance Site Web — Annuel', 'amount' => 1490, 'mode' => 'payment', 'record' => 'unique', 'env' => 'STRIPE_PRICE_MAINTENANCE_YEARLY'],
    'rs_basic' => ['name' => 'Gestion Réseaux Sociaux — Basic', 'amount' => 160, 'mode' => 'subscription', 'record' => 'abonnement', 'recurring' => ['interval' => 'month'], 'env' => 'STRIPE_PRICE_SOCIAL_BASIC_MONTHLY'],
    'rs_plus' => ['name' => 'Gestion Réseaux Sociaux — Plus', 'amount' => 320, 'mode' => 'subscription', 'record' => 'abonnement', 'recurring' => ['interval' => 'month'], 'env' => 'STRIPE_PRICE_SOCIAL_PLUS_MONTHLY'],
    'rs_facebook' => ['name' => 'Création Page Facebook', 'amount' => 120, 'mode' => 'payment', 'record' => 'unique', 'env' => 'STRIPE_PRICE_SOCIAL_FACEBOOK'],
    'rs_instagram' => ['name' => 'Création Compte Instagram', 'amount' => 100, 'mode' => 'payment', 'record' => 'unique', 'env' => 'STRIPE_PRICE_SOCIAL_INSTAGRAM'],
    'rs_tiktok' => ['name' => 'Création Page TikTok', 'amount' => 150, 'mode' => 'payment', 'record' => 'unique', 'env' => 'STRIPE_PRICE_SOCIAL_TIKTOK'],
    'rs_linkedin' => ['name' => 'Création Page LinkedIn', 'amount' => 80, 'mode' => 'payment', 'record' => 'unique', 'env' => 'STRIPE_PRICE_SOCIAL_LINKEDIN'],
];

if (!isset($catalog[$priceKey])) {
    cx_json(422, ['ok' => false, 'error' => 'Formule de paiement inconnue.']);
}

// Options de création de site (prix en euros) et formules auxquelles chacune s'applique.
// Le navigateur n'envoie que des identifiants : le total est toujours recalculé ici.
const CX_WEB_DEPOSIT_PERCENT = 30;
$webPages = ['1' => 0, '1-5' => 0, '6-10' => 90, '10+' => 190];
$webOptions = [
    'seo-avance' => ['price' => 190, 'for' => ['web_express', 'web_vitrine']],
    'formulaire-avance' => ['price' => 60, 'for' => ['web_express', 'web_vitrine']],
    'animations' => ['price' => 80, 'for' => ['web_express', 'web_vitrine']],
    'hebergement' => ['price' => 60, 'for' => ['web_express', 'web_vitrine']],
    'blog' => ['price' => 120, 'for' => ['web_vitrine']],
    'galerie' => ['price' => 90, 'for' => ['web_vitrine']],
    'stock-avance' => ['price' => 120, 'for' => ['web_ecommerce']],
    'fiches-avancees' => ['price' => 100, 'for' => ['web_ecommerce']],
    'multidevise' => ['price' => 80, 'for' => ['web_ecommerce']],
    'seo-ecom' => ['price' => 190, 'for' => ['web_ecommerce']],
    'avis-clients' => ['price' => 70, 'for' => ['web_ecommerce']],
];

// Les formules sociales fixes ne peuvent pas encaisser un devis personnalisé.
// Tout champ supplémentaire (publicité, options mensuelles, pack…) exige une validation.
if (str_starts_with($priceKey, 'rs_') && (
    array_diff(array_keys($payload), ['priceKey', 'webPages', 'webOptions']) !== []
    || ($payload['webPages'] ?? '') !== ''
    || ($payload['webOptions'] ?? []) !== []
)) {
    cx_json(422, ['ok' => false, 'error' => 'Ce devis personnalisé doit être validé avant paiement.']);
}

$product = $catalog[$priceKey];
$unitAmountCents = ($product['amount'] ?? 0) * 100;
$projectTotal = null;
$webPagesKey = '';
$webOptionIds = [];

if (isset($product['total'])) {
    $projectTotal = $product['total'];
    $invalidOptions = static fn () => cx_json(422, ['ok' => false, 'error' => 'Options de projet invalides.']);

    $webPagesKey = $payload['webPages'] ?? '';
    if (!is_string($webPagesKey) || ($priceKey === 'web_express' && !in_array($webPagesKey, ['', '1'], true))) {
        $invalidOptions();
    }
    if ($webPagesKey !== '') {
        if (!isset($webPages[$webPagesKey])) {
            $invalidOptions();
        }
        $projectTotal += $webPages[$webPagesKey];
    }

    $requestedOptions = $payload['webOptions'] ?? [];
    if (!is_array($requestedOptions) || !array_is_list($requestedOptions) || count($requestedOptions) > 20) {
        $invalidOptions();
    }
    foreach ($requestedOptions as $requestedOption) {
        if (!is_string($requestedOption)) {
            $invalidOptions();
        }
        $optionId = $requestedOption;
        if (!isset($webOptions[$optionId]) || !in_array($priceKey, $webOptions[$optionId]['for'], true)) {
            $invalidOptions();
        }
        if (in_array($optionId, $webOptionIds, true)) {
            continue;
        }
        $webOptionIds[] = $optionId;
        $projectTotal += $webOptions[$optionId]['price'];
    }

    // Acompte en centimes, calculé sur des euros entiers : aucun arrondi flottant.
    $unitAmountCents = intdiv($projectTotal * 100 * CX_WEB_DEPOSIT_PERCENT, 100);
}
$hasWebExtras = $projectTotal !== null && $projectTotal !== $product['total'];

if (cx_env('STRIPE_SECRET_KEY') === '') {
    cx_json(503, ['ok' => false, 'error' => 'Le paiement sécurisé est momentanément indisponible.']);
}

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

$productName = $product['name'];
if ($hasWebExtras) {
    $productName .= ' (30 % d\'un projet de ' . number_format($projectTotal, 0, ',', ' ') . ' €, options incluses)';
}
// Un Price Stripe configuré ne vaut que pour la formule de base : avec options, le montant vient du calcul serveur.
$lineItem = $configuredPrice !== '' && !$hasWebExtras
    ? ['price' => $configuredPrice, 'quantity' => 1]
    : [
        'price_data' => array_filter([
            'currency' => 'eur',
            'product_data' => ['name' => $productName],
            'unit_amount' => $unitAmountCents,
            'recurring' => $product['recurring'] ?? null,
        ]),
        'quantity' => 1,
    ];

$metadata = [
    'price_key' => $priceKey,
    'product_name' => $productName,
    'payment_record_mode' => $product['record'],
];
if ($projectTotal !== null) {
    $metadata['project_total_eur'] = (string) $projectTotal;
    $metadata['deposit_percent'] = (string) CX_WEB_DEPOSIT_PERCENT;
    if ($webPagesKey !== '') {
        $metadata['web_pages'] = $webPagesKey;
    }
    if ($webOptionIds !== []) {
        $metadata['web_options'] = implode(',', $webOptionIds);
    }
}

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
        'metadata' => $metadata,
    ]);
} catch (Throwable $exception) {
    cx_log('Création de session Stripe impossible : ' . $exception->getMessage());
    cx_json(502, ['ok' => false, 'error' => 'Impossible de préparer le paiement sécurisé.']);
}

cx_json(200, ['ok' => true, 'url' => $session->url, 'session_id' => $session->id]);
