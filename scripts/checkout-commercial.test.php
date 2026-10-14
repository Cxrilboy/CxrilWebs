<?php
declare(strict_types=1);

// Tests hors réseau : le véritable endpoint est exécuté, seul bootstrap/Stripe est simulé.
// Lancer : php scripts/checkout-commercial.test.php [chemin-endpoint-avant-modifications]
namespace Stripe\HttpClient {
    class CurlClient { public function setConnectTimeout($n) {} public function setTimeout($n) {} }
}
namespace Stripe {
    class ApiRequestor { public static function setHttpClient($client) {} }
    class StripeClient {
        public object $checkout;
        public function __construct($key) {
            $this->checkout = (object) ['sessions' => new class {
                public function create($params) {
                    $GLOBALS['capturedSessions'][] = $params;
                    return (object) ['url' => 'https://checkout.example.test/session', 'id' => 'cs_test_simulated'];
                }
            }];
        }
    }
}
namespace {
    if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
    final class TestResponse extends \Exception {
        public function __construct(public int $status, public array $body) { parent::__construct(); }
    }
    function cx_require_post() {}
    function cx_require_same_origin() {}
    function cx_enforce_rate_limit(...$args) {}
    function cx_json_payload($limit) { return $GLOBALS['testPayload']; }
    function cx_clean_text($value, $limit, $singleLine = false) { return is_string($value) ? trim(strip_tags($value)) : ''; }
    function cx_json($status, $body): never { throw new TestResponse($status, $body); }
    function cx_env($key) { return $key === 'STRIPE_SECRET_KEY' ? 'test-placeholder' : ($GLOBALS['testEnv'][$key] ?? ''); }
    function cx_require_composer() {}
    function cx_app_url() { return 'https://example.test'; }
    function cx_log($text) { throw new \RuntimeException($text); }

    function runEndpoint(array $payload, array $env = [], ?string $file = null): array {
        static $run = 0;
        $GLOBALS['testPayload'] = $payload;
        $GLOBALS['testEnv'] = $env;
        $GLOBALS['capturedSessions'] = [];
        $source = file_get_contents($file ?? __DIR__ . '/../api/create-checkout-session.php');
        $source = str_replace("require_once __DIR__ . '/../config/bootstrap.php';", '', $source);
        // Namespace distinct pour que la constante du véritable endpoint puisse être redéclarée.
        $source = str_replace('declare(strict_types=1);', 'declare(strict_types=1); namespace CheckoutCase' . ++$run . '; use \\Throwable;', $source);
        try { eval(preg_replace('/^<\?php\s*/', '', $source)); }
        catch (TestResponse $response) {
            return ['status' => $response->status, 'body' => $response->body, 'sessions' => $GLOBALS['capturedSessions']];
        }
        throw new \RuntimeException('Endpoint sans réponse');
    }
    $checks = 0;
    function check(bool $ok, string $label): void {
        $GLOBALS['checks']++;
        if (!$ok) throw new \RuntimeException('FAIL: ' . $label);
    }
    $catalog = [
        'web_express' => [8700, 'payment'], 'web_vitrine' => [26700, 'payment'], 'web_ecommerce' => [50700, 'payment'],
        'maintenance_site_ponctuel' => [8000, 'payment'], 'maintenance_site_mensuel' => [15000, 'subscription'], 'maintenance_site_annuel' => [149000, 'payment'],
        'rs_basic' => [16000, 'subscription'], 'rs_plus' => [32000, 'subscription'],
        'rs_facebook' => [12000, 'payment'], 'rs_instagram' => [10000, 'payment'], 'rs_tiktok' => [15000, 'payment'], 'rs_linkedin' => [8000, 'payment'],
    ];
    foreach ($catalog as $key => [$cents, $mode]) {
        $r = runEndpoint(['priceKey' => $key]);
        check($r['status'] === 200 && count($r['sessions']) === 1, $key . ' session unique');
        $s = $r['sessions'][0];
        $price = $s['line_items'][0]['price_data'];
        check($price['unit_amount'] === $cents && $price['currency'] === 'eur', $key . ' centimes');
        check($s['mode'] === $mode, $key . ' mode');
        check(($price['recurring'] ?? null) === ($mode === 'subscription' ? ['interval' => 'month'] : null), $key . ' récurrence');
        check($s['success_url'] === 'https://example.test/merci.html?session_id={CHECKOUT_SESSION_ID}&formula=' . $key, $key . ' retour');
    }
    $invalid = [];
    foreach (['rs_ads', 'web_app', 'app', 'appweb', 'rs_audit', 'rs_mensuel', 'rs_annuel', '', 'inconnue'] as $key) $invalid[] = ['priceKey' => $key];
    foreach (['6-10', '10+', '1-5', '2', [], 1, '<b>1</b>'] as $pages) $invalid[] = ['priceKey' => 'web_express', 'webPages' => $pages];
    foreach ([['inconnue'], ['blog'], ['pub-fb'], [['seo-avance']], 'seo-avance', ['x' => 'seo-avance'], array_fill(0, 21, 'seo-avance'), ['<b>seo-avance</b>']] as $options) $invalid[] = ['priceKey' => 'web_express', 'webOptions' => $options];
    foreach (['rs_basic', 'rs_plus', 'rs_facebook', 'rs_instagram'] as $key) {
        foreach ([['rsOptions' => ['pub-fb']], ['rsOptions' => ['stories']], ['options' => ['pub-ig']], ['webOptions' => ['stories']], ['webPages' => '6-10'], ['campaign' => true], ['amount' => 1]] as $extra) $invalid[] = ['priceKey' => $key] + $extra;
    }
    foreach ($invalid as $i => $payload) {
        $r = runEndpoint($payload);
        check($r['status'] === 422 && $r['sessions'] === [], 'requête refusée avant Stripe #' . $i);
    }
    foreach ([
        [['priceKey' => 'web_express', 'webPages' => '1', 'webOptions' => ['seo-avance']], 14400, '480'],
        [['priceKey' => 'web_vitrine', 'webPages' => '6-10', 'webOptions' => ['seo-avance', 'blog']], 38700, '1290'],
        [['priceKey' => 'web_ecommerce', 'webPages' => '10+', 'webOptions' => ['stock-avance']], 60000, '2000'],
        [['priceKey' => 'web_vitrine', 'webOptions' => ['blog', 'blog']], 30300, '1010'],
        [['priceKey' => 'web_vitrine', 'amount' => 1, 'total' => 1, 'deposit' => 1], 26700, '890'],
    ] as [$payload, $cents, $total]) {
        $r = runEndpoint($payload);
        check($r['status'] === 200, 'options autorisées');
        $s = $r['sessions'][0];
        check($s['line_items'][0]['price_data']['unit_amount'] === $cents, 'calcul serveur');
        check($s['metadata']['project_total_eur'] === $total && $s['metadata']['deposit_percent'] === '30', 'métadonnées');
    }
    $env = ['STRIPE_PRICE_WEB_VITRINE_DEPOSIT' => 'price_fixture'];
    $base = runEndpoint(['priceKey' => 'web_vitrine'], $env);
    check($base['sessions'][0]['line_items'][0]['price'] === 'price_fixture', 'Price configuré sans options');
    $extra = runEndpoint(['priceKey' => 'web_vitrine', 'webOptions' => ['blog']], $env);
    check($extra['sessions'][0]['line_items'][0]['price_data']['unit_amount'] === 30300, 'Price ignoré avec options');
    foreach (['', 'price_...', 'price_fixture'] as $priceId) {
        foreach (['ponctuel' => 'ONESHOT', 'mensuel' => 'MONTHLY', 'annuel' => 'YEARLY'] as $suffix => $envSuffix) {
            $payload = ['priceKey' => 'maintenance_site_' . $suffix];
            $env = ['STRIPE_PRICE_MAINTENANCE_' . $envSuffix => $priceId];
            $r = runEndpoint($payload, $env);
            check($r['status'] === 200, 'Maintenance avec Price ' . $suffix);
            if (isset($argv[1])) check($r === runEndpoint($payload, $env, $argv[1]), 'Maintenance identique au code initial : ' . $suffix);
        }
    }
    echo 'PASS: ' . $checks . ' assertions ; ' . count($invalid) . " requêtes invalides bloquées ; aucun appel réseau.\n";
}
