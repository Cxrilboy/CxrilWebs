<?php
declare(strict_types=1);
// Vérifications en lecture seule, à exécuter sur l'hébergement configuré.
// php scripts/stripe-preflight.php [--allow-live]
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/../config/bootstrap.php';
$errors = 0;
function preflight(bool $ok, string $label): void {
    echo ($ok ? 'OK   ' : 'FAIL ') . $label . PHP_EOL;
    if (!$ok) $GLOBALS['errors']++;
}
preflight(PHP_VERSION_ID >= 80100, 'PHP 8.1 minimum');
preflight(extension_loaded('curl'), 'Extension cURL');
preflight(is_file(__DIR__ . '/../vendor/autoload.php'), 'Dépendances Composer installées');
$key = cx_env('STRIPE_SECRET_KEY');
$testMode = str_starts_with($key, 'sk_test_') || str_starts_with($key, 'rk_test_');
$liveMode = str_starts_with($key, 'sk_live_') || str_starts_with($key, 'rk_live_');
preflight($testMode || $liveMode, 'Clé Stripe configurée (valeur masquée)');
preflight($testMode || ($liveMode && in_array('--allow-live', $argv, true)), 'Mode autorisé pour ce contrôle en lecture seule');
preflight(cx_env('STRIPE_WEBHOOK_SECRET') !== '', 'Signature webhook configurée (valeur masquée)');
preflight(cx_supabase_configured(), 'Supabase configuré (valeurs masquées)');
if ($errors > 0) exit(1);
cx_require_composer();
$stripe = new \Stripe\StripeClient($key);
$http = new \Stripe\HttpClient\CurlClient();
$http->setConnectTimeout(5); $http->setTimeout(15);
\Stripe\ApiRequestor::setHttpClient($http);
$source = file_get_contents(__DIR__ . '/../api/create-checkout-session.php');
preg_match_all("/'((?:web|maintenance|rs)_[a-z_]+)' => \\[([^\\n]+)\\],/", $source, $matches, PREG_SET_ORDER);
preflight(count($matches) === 12, 'Catalogue serveur : 12 formules');
foreach ($matches as $match) {
    $label = $match[1]; $line = $match[2];
    preg_match("/'env' => '([^']+)'/", $line, $env);
    preg_match("/'mode' => '([^']+)'/", $line, $mode);
    preg_match("/'(total|amount)' => (\\d+)/", $line, $amount);
    $expectedCents = (int) $amount[2] * ($amount[1] === 'total' ? 30 : 100);
    $priceId = cx_env($env[1]);
    if ($priceId === '' || $priceId === 'price_...') {
        preflight(true, "$label : tarif serveur $expectedCents centimes, " . $mode[1]);
        continue;
    }
    try {
        $price = $stripe->prices->retrieve($priceId, []);
        $recurring = $mode[1] === 'subscription';
        preflight($price->active && (bool) $price->livemode === $liveMode && $price->currency === 'eur'
            && $price->unit_amount === $expectedCents && $price->type === ($recurring ? 'recurring' : 'one_time')
            && (!$recurring || ($price->recurring->interval === 'month' && $price->recurring->interval_count === 1)),
            "$label : Price distant actif, montant, devise, mode et récurrence");
    } catch (Throwable $e) { preflight(false, "$label : Price distant inaccessible ou invalide"); }
}
foreach (['stripe_billing_events', 'stripe_billing_locks', 'stripe_subscriptions', 'stripe_subscription_invoices'] as $table) {
    $r = cx_supabase_request('GET', '/rest/v1/' . $table . '?select=livemode&limit=0', [], 'return=minimal');
    preflight($r['ok'], 'Migration Supabase : ' . $table);
}
require_once __DIR__ . '/../api/stripe-billing.php';
$required = array_merge(CX_BILLING_EVENTS, ['checkout.session.completed', 'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed', 'checkout.session.expired', 'charge.refunded']);
try {
    $found = false;
    foreach ($stripe->webhookEndpoints->all(['limit' => 100])->autoPagingIterator() as $endpoint) {
        if ($endpoint->url !== cx_app_url() . '/api/stripe-webhook.php') continue;
        $found = true;
        preflight($endpoint->status === 'enabled' && (bool) $endpoint->livemode === $liveMode, 'Webhook actif pour APP_URL et le bon mode');
        $missing = in_array('*', $endpoint->enabled_events, true) ? [] : array_diff($required, $endpoint->enabled_events);
        preflight($missing === [], 'Événements webhook' . ($missing ? ' manquants : ' . implode(', ', $missing) : ' complets'));
    }
    preflight($found, 'Endpoint webhook correspondant à APP_URL');
} catch (Throwable $e) { preflight(false, 'Lecture des endpoints Stripe indisponible'); }
echo $errors === 0 ? "Contrôles réussis ; un paiement de test de bout en bout reste requis.\n" : "$errors contrôle(s) à corriger.\n";
exit($errors ? 1 : 0);
