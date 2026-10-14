<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/bootstrap.php';

cx_require_post();
cx_require_same_origin();
cx_enforce_rate_limit('contact', 5, 3600);
$payload = cx_json_payload();

// Le champ invisible est rempli par les robots. Une réponse neutre évite de leur confirmer la protection.
if (cx_honeypot_triggered($payload)) {
    cx_json(200, ['ok' => true]);
}

$nom = cx_clean_text($payload['nom'] ?? '', 100, true);
$email = cx_valid_email((string) ($payload['email'] ?? ''));
$message = cx_clean_text($payload['message'] ?? '', 1000);
$service = cx_clean_text($payload['serviceRef'] ?? '', 40, true);
$services = ['web' => 'Création de site web', 'maintenance' => 'Maintenance', 'reseaux-sociaux' => 'Réseaux sociaux'];

if (strlen($nom) < 2 || $email === '' || strlen($message) < 10 || !isset($services[$service])) {
    cx_json(422, ['ok' => false, 'error' => 'Les informations transmises sont incomplètes ou invalides.']);
}

$html = '<h2>Nouvelle demande de contact</h2>'
    . '<p><strong>Nom :</strong> ' . cx_html($nom) . '</p>'
    . '<p><strong>Email :</strong> ' . cx_html($email) . '</p>'
    . '<p><strong>Service :</strong> ' . cx_html($services[$service]) . '</p>'
    . '<p><strong>Message :</strong><br>' . nl2br(cx_html($message)) . '</p>';

try {
    cx_send_mail('[CxrilWebs] Nouveau contact — ' . $services[$service], $html, $email, $nom);
} catch (Throwable $exception) {
    cx_log('Envoi du contact impossible : ' . $exception->getMessage());
    cx_json(503, ['ok' => false, 'error' => 'Le formulaire est momentanément indisponible.']);
}

// L'espace d'administration Supabase reste synchronisé, sans rendre l'envoi d'email dépendant de ce service.
if (cx_supabase_configured()) {
    $result = cx_supabase_request('POST', '/rest/v1/form_submissions', [
        'type' => 'contact',
        'nom' => $nom,
        'email' => $email,
        'message' => $message,
        'service_ref' => $service,
        'ip_hash' => hash('sha256', cx_client_ip()),
        'traite' => false,
    ]);
    if (!$result['ok']) {
        cx_log('Synchronisation Supabase du contact impossible (HTTP ' . $result['status'] . ').');
    }
}

cx_json(201, ['ok' => true]);
