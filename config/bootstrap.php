<?php
declare(strict_types=1);

/** Fonctions communes aux API PHP de CxrilWebs. */

const CXRILWEBS_ROOT = __DIR__ . DIRECTORY_SEPARATOR . '..';

function cx_load_environment(): void
{
    static $loaded = false;
    if ($loaded) {
        return;
    }
    $loaded = true;

    $file = __DIR__ . DIRECTORY_SEPARATOR . '.env';
    if (!is_readable($file)) {
        return;
    }

    foreach (file($file, FILE_IGNORE_NEW_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || strpos($line, '=') === false) {
            continue;
        }

        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value);
        if (!preg_match('/^[A-Z][A-Z0-9_]*$/', $key)) {
            continue;
        }
        if ((str_starts_with($value, '"') && str_ends_with($value, '"')) || (str_starts_with($value, "'") && str_ends_with($value, "'"))) {
            $value = substr($value, 1, -1);
        }
        if (getenv($key) === false) {
            putenv($key . '=' . $value);
            $_ENV[$key] = $value;
        }
    }
}

cx_load_environment();

function cx_env(string $key, string $default = ''): string
{
    $value = getenv($key);
    return $value === false ? $default : trim((string) $value);
}

function cx_app_url(): string
{
    $url = rtrim(cx_env('APP_URL', 'https://cxrilwebs.fr'), '/');
    return filter_var($url, FILTER_VALIDATE_URL) ? $url : 'https://cxrilwebs.fr';
}

function cx_json(int $status, array $body): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: no-store, private');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function cx_require_post(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        header('Allow: POST');
        cx_json(405, ['ok' => false, 'error' => 'Méthode non autorisée.']);
    }
}

function cx_require_same_origin(): void
{
    $origin = trim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''));
    if ($origin === '') {
        // Les navigateurs envoient toujours Origin sur un POST ; à défaut, le Referer doit venir du site.
        $referer = trim((string) ($_SERVER['HTTP_REFERER'] ?? ''));
        $parts = parse_url($referer);
        if (!is_array($parts) || !isset($parts['scheme'], $parts['host'])) {
            cx_json(403, ['ok' => false, 'error' => 'Origine de requête non autorisée.']);
        }
        $origin = $parts['scheme'] . '://' . $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '');
    }
    if (!hash_equals(cx_app_url(), rtrim($origin, '/'))) {
        cx_json(403, ['ok' => false, 'error' => 'Origine de requête non autorisée.']);
    }
}

function cx_json_payload(int $maxBytes = 20000): array
{
    $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($length > $maxBytes) {
        cx_json(413, ['ok' => false, 'error' => 'Requête trop volumineuse.']);
    }

    $raw = file_get_contents('php://input');
    if (!is_string($raw) || $raw === '' || strlen($raw) > $maxBytes) {
        cx_json(400, ['ok' => false, 'error' => 'Requête invalide.']);
    }

    try {
        $payload = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    } catch (Throwable $exception) {
        cx_json(400, ['ok' => false, 'error' => 'Requête invalide.']);
    }
    if (!is_array($payload)) {
        cx_json(400, ['ok' => false, 'error' => 'Requête invalide.']);
    }
    return $payload;
}

function cx_clean_text(mixed $value, int $maxLength, bool $singleLine = false): string
{
    if (!is_string($value)) {
        return '';
    }
    $value = str_replace("\0", '', strip_tags($value));
    $value = $singleLine
        ? (string) preg_replace('/\s+/u', ' ', $value)
        : (string) preg_replace("/\r\n?|\n/u", "\n", $value);
    $value = trim($value);
    return function_exists('mb_substr')
        ? mb_substr($value, 0, $maxLength, 'UTF-8')
        : substr($value, 0, $maxLength);
}

function cx_valid_email(string $email): string
{
    $email = strtolower(cx_clean_text($email, 254, true));
    return filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : '';
}

function cx_honeypot_triggered(array $payload): bool
{
    return cx_clean_text($payload['website'] ?? '', 200, true) !== '';
}

function cx_client_ip(): string
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : 'unknown';
}

function cx_enforce_rate_limit(string $scope, int $maxRequests, int $periodSeconds): void
{
    // Dossier persistant et protégé par config/.htaccess ; le dossier temporaire sert de repli.
    $directory = __DIR__ . DIRECTORY_SEPARATOR . 'ratelimit';
    if (!is_dir($directory) && !@mkdir($directory, 0700, true) && !is_dir($directory)) {
        $directory = sys_get_temp_dir();
    }
    $file = rtrim($directory, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR
        . 'cxrilwebs-' . $scope . '-' . hash('sha256', cx_client_ip()) . '.json';
    $handle = @fopen($file, 'c+');
    if ($handle === false) {
        return;
    }

    $limited = false;
    if (flock($handle, LOCK_EX)) {
        $raw = stream_get_contents($handle);
        $timestamps = json_decode($raw ?: '[]', true);
        $timestamps = is_array($timestamps) ? $timestamps : [];
        $now = time();
        $timestamps = array_values(array_filter($timestamps, static fn ($time): bool => is_int($time) && $time > $now - $periodSeconds));
        $limited = count($timestamps) >= $maxRequests;
        if (!$limited) {
            $timestamps[] = $now;
            rewind($handle);
            ftruncate($handle, 0);
            fwrite($handle, json_encode($timestamps));
        }
        flock($handle, LOCK_UN);
    }
    fclose($handle);

    if ($limited) {
        cx_json(429, ['ok' => false, 'error' => 'Trop de tentatives. Réessayez dans quelques instants.']);
    }
}

function cx_require_composer(): void
{
    static $loaded = false;
    if ($loaded) {
        return;
    }
    $autoload = CXRILWEBS_ROOT . DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR . 'autoload.php';
    if (!is_readable($autoload)) {
        cx_json(503, ['ok' => false, 'error' => 'Le service est momentanément indisponible.']);
    }
    require_once $autoload;
    $loaded = true;
}

function cx_send_mail(string $subject, string $html, string $replyToEmail, string $replyToName): void
{
    $host = cx_env('SMTP_HOST');
    $username = cx_env('SMTP_USERNAME');
    $password = cx_env('SMTP_PASSWORD');
    $from = cx_valid_email(cx_env('MAIL_FROM_EMAIL'));
    $recipient = cx_valid_email(cx_env('CONTACT_TO_EMAIL'));
    if ($host === '' || $username === '' || $password === '' || $from === '' || $recipient === '') {
        throw new RuntimeException('Configuration SMTP incomplète.');
    }

    cx_require_composer();
    $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
    $mail->isSMTP();
    $mail->Host = $host;
    $mail->Port = (int) cx_env('SMTP_PORT', '465');
    $mail->SMTPAuth = true;
    $mail->Username = $username;
    $mail->Password = $password;
    $mail->CharSet = 'UTF-8';
    $mail->Timeout = 15;

    $encryption = strtolower(cx_env('SMTP_ENCRYPTION', 'ssl'));
    if ($encryption === 'ssl' || $encryption === 'smtps') {
        $mail->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
    } elseif ($encryption === 'tls' || $encryption === 'starttls') {
        $mail->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
    }

    $mail->setFrom($from, cx_env('MAIL_FROM_NAME', 'CxrilWebs'));
    $mail->addAddress($recipient);
    $mail->addReplyTo($replyToEmail, $replyToName);
    $mail->isHTML(true);
    $mail->Subject = $subject;
    $mail->Body = $html;
    $mail->AltBody = trim(html_entity_decode(strip_tags(str_replace(['<br>', '<br/>', '<br />'], "\n", $html)), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    $mail->send();
}

function cx_supabase_configured(): bool
{
    return cx_env('SUPABASE_URL') !== '' && cx_env('SUPABASE_SERVICE_ROLE_KEY') !== '';
}

/** @return array{ok: bool, status: int, json: array} */
function cx_supabase_request(string $method, string $path, array $body, string $prefer = 'return=minimal'): array
{
    if (!cx_supabase_configured() || !function_exists('curl_init')) {
        return ['ok' => false, 'status' => 0, 'json' => []];
    }

    $baseUrl = rtrim(cx_env('SUPABASE_URL'), '/');
    if (!filter_var($baseUrl, FILTER_VALIDATE_URL)) {
        return ['ok' => false, 'status' => 0, 'json' => []];
    }
    $key = cx_env('SUPABASE_SERVICE_ROLE_KEY');
    $curl = curl_init($baseUrl . $path);
    if ($curl === false) {
        return ['ok' => false, 'status' => 0, 'json' => []];
    }

    curl_setopt_array($curl, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        CURLOPT_HTTPHEADER => [
            'apikey: ' . $key,
            'Authorization: Bearer ' . $key,
            'Content-Type: application/json',
            'Prefer: ' . $prefer,
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 10,
    ]);
    $response = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);

    $decoded = is_string($response) ? json_decode($response, true) : [];
    return ['ok' => $status >= 200 && $status < 300, 'status' => $status, 'json' => is_array($decoded) ? $decoded : []];
}

function cx_html(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function cx_log(string $message): void
{
    error_log('[CxrilWebs] ' . $message);
}
