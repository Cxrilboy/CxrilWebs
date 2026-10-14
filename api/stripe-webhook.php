<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/bootstrap.php';

cx_require_post();
if (cx_env('STRIPE_SECRET_KEY') === '' || cx_env('STRIPE_WEBHOOK_SECRET') === '') {
    cx_json(503, ['ok' => false, 'error' => 'Webhook non configuré.']);
}

$signature = (string) ($_SERVER['HTTP_STRIPE_SIGNATURE'] ?? '');
$payload = file_get_contents('php://input');
if ($signature === '' || !is_string($payload) || $payload === '') {
    cx_json(400, ['ok' => false, 'error' => 'Signature Stripe absente.']);
}

try {
    cx_require_composer();
    $event = \Stripe\Webhook::constructEvent($payload, $signature, cx_env('STRIPE_WEBHOOK_SECRET'));
} catch (Throwable $exception) {
    cx_log('Signature Stripe invalide.');
    cx_json(400, ['ok' => false, 'error' => 'Signature Stripe invalide.']);
}

/** @return array{ok: bool, status: int, json: array} */
function cx_webhook_sync(string $method, string $path, array $body, string $prefer = 'return=minimal'): array
{
    $result = cx_supabase_request($method, $path, $body, $prefer);
    if (!$result['ok']) {
        throw new RuntimeException('Synchronisation Supabase impossible (HTTP ' . $result['status'] . ').');
    }
    return $result;
}

try {
    $object = $event->data->object;
    $type = (string) $event->type;

    if (in_array($type, ['checkout.session.completed', 'checkout.session.async_payment_succeeded'], true)) {
        $paid = ($object->payment_status ?? '') === 'paid';
        $email = cx_valid_email((string) ($object->customer_details->email ?? ''));
        $userId = null;

        if ($email !== '' && cx_supabase_configured()) {
            // Sans rgpd_consent : la fusion ne modifie pas un consentement déjà enregistré.
            $name = cx_clean_text($object->customer_details->name ?? '', 150, true);
            $user = cx_supabase_request('POST', '/rest/v1/users?on_conflict=email', [
                'nom' => $name !== '' ? $name : $email,
                'email' => $email,
            ], 'return=representation,resolution=merge-duplicates');
            $candidate = $user['json'][0]['id'] ?? null;
            $userId = is_string($candidate) && $candidate !== '' ? $candidate : null;
        }

        if (cx_supabase_configured()) {
            cx_webhook_sync('POST', '/rest/v1/paiements?on_conflict=stripe_session_id', [
                'devis_id' => null,
                'user_id' => $userId,
                'stripe_session_id' => $object->id,
                'stripe_payment_intent' => is_string($object->payment_intent ?? null) ? $object->payment_intent : null,
                'stripe_subscription_id' => is_string($object->subscription ?? null) ? $object->subscription : null,
                'mode' => $object->metadata->payment_record_mode ?? (($object->mode ?? '') === 'subscription' ? 'abonnement' : 'acompte'),
                'statut' => $paid ? 'reussi' : 'en_attente',
                'montant' => ((int) ($object->amount_total ?? 0)) / 100,
                'devise' => strtoupper((string) ($object->currency ?? 'eur')),
                'description' => $object->metadata->product_name ?? 'Paiement CxrilWebs',
                'metadata' => [
                    'price_key' => $object->metadata->price_key ?? null,
                    'stripe_payment_status' => $object->payment_status ?? null,
                ],
                'paid_at' => $paid ? gmdate('c') : null,
            ], 'return=minimal,resolution=merge-duplicates');
        }

        if ($paid && $email !== '') {
            try {
                $label = cx_clean_text($object->metadata->product_name ?? 'Paiement', 120, true);
                $amount = number_format(((int) ($object->amount_total ?? 0)) / 100, 2, ',', ' ');
                cx_send_mail(
                    '[CxrilWebs] Paiement reçu — ' . $label,
                    '<h2>Paiement reçu</h2><p><strong>Produit :</strong> ' . cx_html($label) . '</p>'
                    . '<p><strong>Montant :</strong> ' . cx_html($amount) . ' €</p>'
                    . '<p><strong>Client :</strong> ' . cx_html($email) . '</p>'
                    . '<p><strong>Session :</strong> ' . cx_html((string) $object->id) . '</p>',
                    $email,
                    $email
                );
            } catch (Throwable $exception) {
                cx_log('Notification de paiement impossible : ' . $exception->getMessage());
            }
        }
    } elseif ($type === 'checkout.session.async_payment_failed' && cx_supabase_configured()) {
        cx_webhook_sync('PATCH', '/rest/v1/paiements?stripe_session_id=eq.' . rawurlencode((string) $object->id), ['statut' => 'echoue']);
    } elseif ($type === 'checkout.session.expired' && cx_supabase_configured()) {
        cx_webhook_sync('PATCH', '/rest/v1/paiements?stripe_session_id=eq.' . rawurlencode((string) $object->id), ['statut' => 'annule']);
    } elseif ($type === 'charge.refunded' && cx_supabase_configured() && is_string($object->payment_intent ?? null)) {
        cx_webhook_sync('PATCH', '/rest/v1/paiements?stripe_payment_intent=eq.' . rawurlencode($object->payment_intent), ['statut' => 'rembourse']);
    }
} catch (Throwable $exception) {
    cx_log('Traitement du webhook Stripe impossible : ' . $exception->getMessage());
    cx_json(500, ['ok' => false, 'error' => 'Erreur de traitement du webhook.']);
}
cx_json(200, ['received' => true]);
