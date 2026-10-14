<?php
declare(strict_types=1);

// Ce module est appelé seulement après vérification de la signature Stripe.
const CX_BILLING_EVENTS = [
    'customer.subscription.created', 'customer.subscription.updated',
    'customer.subscription.deleted', 'customer.subscription.paused', 'customer.subscription.resumed',
    'invoice.paid', 'invoice.payment_failed', 'invoice.payment_action_required',
    'invoice.voided', 'invoice.marked_uncollectible',
];

function cx_stripe_id(mixed $value): string
{
    return is_string($value) ? $value : (is_object($value) ? (string) ($value->id ?? '') : '');
}

function cx_invoice_subscription(object $invoice): string
{
    // Basil et suivantes ; compatibilité avec les anciens événements.
    return cx_stripe_id($invoice->parent->subscription_details->subscription ?? $invoice->subscription ?? null);
}

function cx_billing_rpc(string $name, array $body): array
{
    $result = cx_supabase_request('POST', '/rest/v1/rpc/' . $name, $body, 'return=representation');
    if (!$result['ok']) {
        throw new RuntimeException('Synchronisation des abonnements indisponible (HTTP ' . $result['status'] . ').');
    }
    return $result['json'];
}

/** Synchronise un état courant, jamais le snapshot potentiellement ancien du webhook. */
function cx_handle_billing_event(object $event, object $stripe): void
{
    if (!in_array($event->type, CX_BILLING_EVENTS, true)) {
        throw new InvalidArgumentException('Événement abonnement non pris en charge.');
    }
    if (!cx_supabase_configured()) {
        throw new RuntimeException('Supabase requis pour le suivi des abonnements.');
    }
    $invoiceEvent = str_starts_with($event->type, 'invoice.');
    $snapshot = $event->data->object;
    $subscriptionId = $invoiceEvent ? cx_invoice_subscription($snapshot) : cx_stripe_id($snapshot);
    if ($invoiceEvent && $subscriptionId === '') {
        return; // Une facture ponctuelle ne correspond pas à un abonnement.
    }
    if (!preg_match('/^sub_[A-Za-z0-9]+$/D', $subscriptionId)
        || !preg_match('/^evt_[A-Za-z0-9]+$/D', (string) $event->id)) {
        throw new RuntimeException('Identifiant Stripe invalide.');
    }

    $mode = (bool) $event->livemode;
    $token = bin2hex(random_bytes(24));
    $claim = cx_billing_rpc('cx_claim_stripe_billing', [
        'p_event_id' => $event->id, 'p_livemode' => $mode,
        'p_subscription_id' => $subscriptionId, 'p_token' => $token,
    ]);
    if (($claim['state'] ?? '') === 'duplicate') return;
    if (($claim['state'] ?? '') !== 'claimed') {
        throw new RuntimeException('Abonnement en cours de synchronisation ; Stripe doit réessayer.');
    }

    // La réservation en base sérialise les traitements d'un abonnement, y compris ses factures.
    // Une réservation expirée ne peut plus enregistrer de résultat (contrôle atomique dans la RPC).
    $invoice = null;
    if ($invoiceEvent) {
        $invoiceId = cx_stripe_id($snapshot);
        if (!preg_match('/^in_[A-Za-z0-9]+$/D', $invoiceId)) throw new RuntimeException('Facture Stripe invalide.');
        $invoice = $stripe->invoices->retrieve($invoiceId, []);
        if (cx_invoice_subscription($invoice) !== $subscriptionId || (bool) $invoice->livemode !== $mode) {
            throw new RuntimeException('Facture incohérente avec son abonnement.');
        }
    }
    $subscription = $stripe->subscriptions->retrieve($subscriptionId, []);
    if (cx_stripe_id($subscription) !== $subscriptionId || (bool) $subscription->livemode !== $mode) {
        throw new RuntimeException('Abonnement Stripe incohérent.');
    }
    $items = [];
    foreach ($subscription->items->data ?? [] as $item) {
        $items[] = [
            'price_id' => cx_stripe_id($item->price ?? null),
            'quantity' => (int) ($item->quantity ?? 1),
            'unit_amount' => $item->price->unit_amount ?? null,
            'currency' => $item->price->currency ?? null,
            'interval' => $item->price->recurring->interval ?? null,
            'interval_count' => $item->price->recurring->interval_count ?? null,
            'current_period_start' => $item->current_period_start ?? $subscription->current_period_start ?? null,
            'current_period_end' => $item->current_period_end ?? $subscription->current_period_end ?? null,
        ];
    }
    $subscriptionState = [
        'id' => $subscriptionId, 'customer_id' => cx_stripe_id($subscription->customer ?? null),
        'status' => (string) $subscription->status,
        'cancel_at_period_end' => (bool) ($subscription->cancel_at_period_end ?? false),
        'cancel_at' => $subscription->cancel_at ?? null,
        'canceled_at' => $subscription->canceled_at ?? null,
        'ended_at' => $subscription->ended_at ?? null,
        'latest_invoice_id' => cx_stripe_id($subscription->latest_invoice ?? null),
        'items' => $items,
    ];
    $invoiceState = $invoice === null ? null : [
        'id' => cx_stripe_id($invoice), 'subscription_id' => $subscriptionId,
        'customer_id' => cx_stripe_id($invoice->customer ?? null),
        'status' => (string) $invoice->status,
        'amount_due' => (int) ($invoice->amount_due ?? 0),
        'amount_paid' => (int) ($invoice->amount_paid ?? 0),
        'amount_remaining' => (int) ($invoice->amount_remaining ?? 0),
        'currency' => (string) ($invoice->currency ?? ''),
        'attempt_count' => (int) ($invoice->attempt_count ?? 0),
        'next_payment_attempt' => $invoice->next_payment_attempt ?? null,
        'paid_at' => $invoice->status_transitions->paid_at ?? null,
        'billing_reason' => $invoice->billing_reason ?? null,
    ];
    $saved = cx_billing_rpc('cx_apply_stripe_billing', [
        'p_event_id' => $event->id, 'p_event_type' => $event->type,
        'p_livemode' => $mode, 'p_subscription_id' => $subscriptionId, 'p_token' => $token,
        'p_subscription' => $subscriptionState, 'p_invoice' => $invoiceState,
    ]);
    if (!in_array($saved['state'] ?? '', ['applied', 'duplicate'], true)) {
        throw new RuntimeException('Confirmation de synchronisation des abonnements absente.');
    }
}
