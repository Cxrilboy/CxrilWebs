<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/bootstrap.php';

cx_require_post();
cx_require_same_origin();
cx_enforce_rate_limit('devis', 5, 3600);
$payload = cx_json_payload();

if (cx_honeypot_triggered($payload)) {
    cx_json(200, ['ok' => true]);
}

$nom = cx_clean_text($payload['nom'] ?? '', 100, true);
$email = cx_valid_email((string) ($payload['email'] ?? ''));
$telephone = cx_clean_text($payload['telephone'] ?? '', 30, true);
$message = cx_clean_text($payload['message'] ?? '', 1000);
$options = cx_clean_text($payload['options'] ?? '', 1500);
$service = cx_clean_text($payload['service'] ?? '', 40, true);
$services = ['web' => 'Création de site web', 'maintenance' => 'Maintenance', 'reseaux-sociaux' => 'Réseaux sociaux'];
$montant = is_numeric($payload['montantHt'] ?? null) ? (float) $payload['montantHt'] : -1;

if (strlen($nom) < 2 || $email === '' || !isset($services[$service]) || $montant < 0 || $montant > 100000 || ($payload['rgpd'] ?? false) !== true) {
    cx_json(422, ['ok' => false, 'error' => 'Les informations transmises sont incomplètes ou invalides.']);
}

$numero = 'DEV-' . date('Y') . '-' . strtoupper(bin2hex(random_bytes(4)));
$montantAffiche = $montant > 0 ? number_format($montant, 2, ',', ' ') . ' € HT' : 'À définir';
$html = '<h2>Nouvelle demande de devis ' . cx_html($numero) . '</h2>'
    . '<p><strong>Nom :</strong> ' . cx_html($nom) . '</p>'
    . '<p><strong>Email :</strong> ' . cx_html($email) . '</p>'
    . ($telephone !== '' ? '<p><strong>Téléphone :</strong> ' . cx_html($telephone) . '</p>' : '')
    . '<p><strong>Service :</strong> ' . cx_html($services[$service]) . '</p>'
    . '<p><strong>Estimation affichée :</strong> ' . cx_html($montantAffiche) . '</p>'
    . ($options !== '' ? '<p><strong>Options :</strong><br>' . nl2br(cx_html($options)) . '</p>' : '')
    . ($message !== '' ? '<p><strong>Message :</strong><br>' . nl2br(cx_html($message)) . '</p>' : '');

try {
    cx_send_mail('[CxrilWebs] Demande de devis ' . $numero, $html, $email, $nom);
} catch (Throwable $exception) {
    cx_log('Envoi du devis impossible : ' . $exception->getMessage());
    cx_json(503, ['ok' => false, 'error' => 'Le formulaire est momentanément indisponible.']);
}

if (cx_supabase_configured()) {
    $user = cx_supabase_request('POST', '/rest/v1/users?on_conflict=email', [
        'nom' => $nom,
        'email' => $email,
        'telephone' => $telephone !== '' ? $telephone : null,
        'rgpd_consent' => true,
        'consented_at' => gmdate('c'),
    ], 'return=representation,resolution=merge-duplicates');
    $userId = $user['json'][0]['id'] ?? null;

    if (is_string($userId) && $userId !== '') {
        $note = trim($message . ($options !== '' ? "\n\nOptions sélectionnées : " . $options : ''));
        $quote = cx_supabase_request('POST', '/rest/v1/devis', [
            'numero' => $numero,
            'user_id' => $userId,
            'service' => $service,
            'statut' => 'brouillon',
            'montant_ht' => $montant,
            'montant_ttc' => $montant,
            'message_client' => $note !== '' ? $note : null,
            'valide_jusqu_au' => gmdate('Y-m-d', strtotime('+30 days')),
        ]);
        // L'espace admin lit les messages dans form_submissions : le devis y est aussi visible.
        $submission = cx_supabase_request('POST', '/rest/v1/form_submissions', [
            'type' => 'devis',
            'nom' => $nom,
            'email' => $email,
            'telephone' => $telephone !== '' ? $telephone : null,
            'sujet' => $numero,
            'message' => $note !== '' ? $note : null,
            'service_ref' => $service,
            'metadata' => ['numero' => $numero, 'montant_ht' => $montant],
            'ip_hash' => hash('sha256', cx_client_ip()),
            'rgpd_consent' => true,
        ]);
        if (!$submission['ok']) {
            cx_log('Synchronisation Supabase du message de devis impossible (HTTP ' . $submission['status'] . ').');
        }
        if (!$quote['ok']) {
            cx_log('Synchronisation Supabase du devis impossible (HTTP ' . $quote['status'] . ').');
        }
    } else {
        cx_log('Synchronisation Supabase du devis impossible : utilisateur non créé.');
    }
}

cx_json(201, ['ok' => true, 'numero' => $numero]);
