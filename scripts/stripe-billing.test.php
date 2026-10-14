<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/../api/stripe-billing.php';

$checks = 0;
$configured = true;
$claimState = 'claimed';
$rpcOk = true;
$calls = [];
function cx_supabase_configured(): bool { return $GLOBALS['configured']; }
function cx_supabase_request($method, $path, $body, $prefer): array {
    $GLOBALS['calls'][] = [$path, $body];
    return ['ok' => $GLOBALS['rpcOk'], 'status' => $GLOBALS['rpcOk'] ? 200 : 503,
        'json' => ['state' => str_contains($path, 'cx_claim') ? $GLOBALS['claimState'] : 'applied']];
}
function check(bool $ok, string $message): void {
    $GLOBALS['checks']++;
    if (!$ok) throw new RuntimeException('FAIL: ' . $message);
}
function fixture(array $value): object { return json_decode(json_encode($value), false, 512, JSON_THROW_ON_ERROR); }
function mustFail(callable $fn): void {
    try { $fn(); } catch (RuntimeException $e) { $GLOBALS['checks']++; return; }
    throw new RuntimeException('Échec attendu');
}
$subscription = fixture([
    'id' => 'sub_test', 'livemode' => false, 'customer' => 'cus_test', 'status' => 'active',
    'cancel_at_period_end' => false, 'latest_invoice' => 'in_test',
    'items' => ['data' => [['price' => ['id' => 'price_test', 'unit_amount' => 16000, 'currency' => 'eur',
        'recurring' => ['interval' => 'month', 'interval_count' => 1]], 'quantity' => 1,
        'current_period_start' => 100, 'current_period_end' => 200]]],
]);
$invoice = fixture([
    'id' => 'in_test', 'livemode' => false, 'parent' => ['subscription_details' => ['subscription' => 'sub_test']],
    'customer' => 'cus_test', 'status' => 'paid', 'amount_due' => 16000, 'amount_paid' => 16000,
    'amount_remaining' => 0, 'currency' => 'eur', 'attempt_count' => 1,
    'status_transitions' => ['paid_at' => 150], 'billing_reason' => 'subscription_cycle',
]);
$stripe = new class {
    public object $subscriptions;
    public object $invoices;
    public function __construct() {
        $this->subscriptions = new class {
            public function retrieve($id, $params) {
                $GLOBALS['calls'][] = ['retrieve_subscription', $id];
                return $GLOBALS['subscription'];
            }
        };
        $this->invoices = new class {
            public function retrieve($id, $params) {
                $GLOBALS['calls'][] = ['retrieve_invoice', $id];
                return $GLOBALS['invoice'];
            }
        };
    }
};
foreach (CX_BILLING_EVENTS as $type) {
    $calls = [];
    $event = fixture(['id' => 'evt_test', 'type' => $type, 'livemode' => false,
        'data' => ['object' => str_starts_with($type, 'invoice.') ? $invoice : $subscription]]);
    cx_handle_billing_event($event, $stripe);
    check(str_ends_with($calls[0][0], 'cx_claim_stripe_billing'), 'réserver avant de lire Stripe');
    $save = $calls[count($calls) - 1];
    check(str_ends_with($save[0], 'cx_apply_stripe_billing'), 'sauvegarde atomique');
    check($save[1]['p_subscription']['status'] === 'active', 'état courant, même pour ancien événement deleted');
    check($save[1]['p_subscription']['items'][0]['current_period_end'] === 200, 'période Basil');
    check($save[1]['p_token'] === $calls[0][1]['p_token'], 'jeton réservation inchangé');
    if (str_starts_with($type, 'invoice.')) {
        check($save[1]['p_invoice']['status'] === 'paid', 'échec ancien ne remplace pas facture payée');
        check($save[1]['p_invoice']['amount_paid'] === 16000, 'centimes exacts');
        check($save[1]['p_invoice']['billing_reason'] === 'subscription_cycle', 'renouvellement identifié');
    } else check($save[1]['p_invoice'] === null, 'résiliation ne réécrit aucune facture');
}

$event = fixture(['id' => 'evt_retry', 'type' => 'invoice.payment_failed', 'livemode' => false, 'data' => ['object' => $invoice]]);
$invoice->status = 'open'; $invoice->amount_paid = 0; $invoice->amount_remaining = 16000;
$subscription->status = 'past_due';
$calls = []; cx_handle_billing_event($event, $stripe);
$saved = $calls[count($calls)-1][1];
check($saved['p_subscription']['status'] === 'past_due', 'abonnement en retard');
check($saved['p_invoice']['amount_paid'] === 0 && $saved['p_invoice']['status'] === 'open', 'facture impayée');
$subscription->status = 'canceled'; $subscription->ended_at = 180;
$event->type = 'customer.subscription.deleted'; $event->data->object = $subscription;
$calls = []; cx_handle_billing_event($event, $stripe);
check($calls[count($calls)-1][1]['p_subscription']['status'] === 'canceled', 'résiliation enregistrée');

$calls = []; $claimState = 'duplicate'; cx_handle_billing_event($event, $stripe);
check(count($calls) === 1, 'rejeu ignoré sans relire Stripe ni écrire');
$calls = []; $claimState = 'busy'; mustFail(fn () => cx_handle_billing_event($event, $stripe));
check(count($calls) === 1, 'concurrence : aucun appel Stripe sous réservation occupée');
$claimState = 'claimed'; $rpcOk = false;
mustFail(fn () => cx_handle_billing_event($event, $stripe)); $rpcOk = true;
$configured = false; mustFail(fn () => cx_handle_billing_event($event, $stripe)); $configured = true;
$subscription->livemode = true;
mustFail(fn () => cx_handle_billing_event($event, $stripe)); $subscription->livemode = false;
check(cx_invoice_subscription(fixture(['subscription' => ['id' => 'sub_old']])) === 'sub_old', 'ancienne API avec objet étendu');
$subscription->current_period_start = 10; $subscription->current_period_end = 20;
unset($subscription->items->data[0]->current_period_start, $subscription->items->data[0]->current_period_end);
$calls = []; cx_handle_billing_event($event, $stripe);
check($calls[count($calls)-1][1]['p_subscription']['items'][0]['current_period_end'] === 20, 'ancienne API : période au niveau abonnement');
$event->type = 'invoice.paid'; $event->data->object = fixture(['id' => 'in_once']);
$calls = []; cx_handle_billing_event($event, $stripe);
check($calls === [], 'facture ponctuelle ignorée par le suivi abonnements');
echo "PASS: $checks assertions de suivi des abonnements.\n";
