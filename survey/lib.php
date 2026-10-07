<?php
// Shared by index.php and results.php. The question list below drives the form, validation,
// the results page and the CSV export, so adding or rewording a question happens here only.
// Plain PHP 7.4+, no dependencies.

const DATA_DIR = __DIR__ . '/data';
// Both data files are .php so that, even if the server ignored data/.htaccess, requesting
// them runs PHP and prints nothing instead of serving the data.
const RESPONSES_FILE = DATA_DIR . '/responses.php';
const RESPONSES_GUARD = "<?php http_response_code(404); exit; ?>\n";
const SECRET_FILE = DATA_DIR . '/secret.php';
const TEXT_MAX = 1000;
const MIN_SECONDS = 3; // faster than this from page load to submit is a bot

function questions(): array
{
    return [
        [
            'id' => 'household',
            'type' => 'radio',
            'label' => 'How many people do you split household bills with?',
            'options' => [
                'none' => 'Nobody, I live alone or someone else handles it',
                '1' => 'One other person',
                '2-3' => 'Two or three',
                '4+' => 'Four or more',
            ],
        ],
        [
            'id' => 'method',
            'type' => 'checkbox',
            'label' => 'How do you split them now?',
            'help' => 'Pick all that apply.',
            'options' => [
                'one_payer' => 'One person pays everything and sends Venmo requests',
                'owners' => 'Each person is in charge of a different bill',
                'spreadsheet' => 'A shared spreadsheet',
                'app' => 'Splitwise or a similar app',
                'chat' => 'Group chat and memory',
                'none' => 'We don’t really split them',
            ],
        ],
        [
            'id' => 'hassle',
            'type' => 'scale',
            'label' => 'How much of a hassle is it?',
            'ends' => ['No hassle', 'Constant headache'],
        ],
        [
            'id' => 'would_use',
            'type' => 'radio',
            'label' => 'Would you use a tool like this?',
            'required' => true,
            'options' => [
                'definitely' => 'Definitely',
                'probably' => 'Probably',
                'unsure' => 'Not sure',
                'probably_not' => 'Probably not',
                'no' => 'No',
            ],
        ],
        [
            'id' => 'features',
            'type' => 'checkbox',
            'label' => 'Which of these would matter most to you?',
            'help' => 'Pick as many as you like.',
            'options' => [
                'reminders' => 'Email reminders before a bill is due',
                'ledger' => 'A clear “who owes whom” ledger',
                'pdf' => 'The actual bill (PDF) attached to each charge',
                'calendar' => 'Due dates in my phone’s calendar',
                'rent' => 'Rent tracking, not just utilities',
                'trends' => 'Charts of what we spend over time',
                'documents' => 'A place for the lease and other house paperwork',
                'pay_links' => 'Venmo / Zelle links to pay in one tap',
                'mobile' => 'Works great on my phone',
            ],
        ],
        [
            'id' => 'wishlist',
            'type' => 'textarea',
            'label' => 'Anything else you’d want it to do?',
            'placeholder' => 'Optional',
        ],
        [
            'id' => 'name_appeal',
            'type' => 'scale',
            'label' => 'How appealing is the name Lejer?',
            'required' => true,
            'ends' => ['Not for me', 'Love it'],
            'section' => 'About the name',
            'intro' => '<p><b>Lejer</b> is Danish for <b>tenant</b>, the person renting a home. Said roughly “LYE-er”, it’s also a nod to <i>ledger</i>, the book where debts get written down.</p>',
        ],
        [
            'id' => 'name_thoughts',
            'type' => 'textarea',
            'label' => 'What does the name make you think of? Got a better one?',
            'placeholder' => 'Optional',
        ],
        [
            'id' => 'email',
            'type' => 'email',
            'label' => 'Want an invite when it launches?',
            'help' => 'Leave your email and you’ll get one message when it’s ready. Nothing else.',
            'placeholder' => 'you@example.com',
            'section' => 'Last thing',
        ],
    ];
}

function h($s): string
{
    return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** Per-install HMAC key for the form's timestamp, created on first use. */
function secret(): string
{
    if (is_readable(SECRET_FILE)) {
        $s = include SECRET_FILE;
        if (is_string($s) && $s !== '') {
            return $s;
        }
    }
    $s = bin2hex(random_bytes(32));
    if (@file_put_contents(SECRET_FILE, "<?php return '$s';\n", LOCK_EX) === false) {
        // data/ isn't writable: keep tokens stable so people see the "couldn't save" error
        // instead of being silently treated as bots.
        return hash('sha256', __DIR__ . php_uname());
    }
    return $s;
}

function form_token(): string
{
    $t = (string) time();
    return $t . '.' . hash_hmac('sha256', $t, secret());
}

/** True when the token is ours and at least MIN_SECONDS old. */
function token_ok(string $token): bool
{
    $parts = explode('.', $token, 2);
    if (count($parts) !== 2 || !ctype_digit($parts[0])) {
        return false;
    }
    if (!hash_equals(hash_hmac('sha256', $parts[0], secret()), $parts[1])) {
        return false;
    }
    return time() - (int) $parts[0] >= MIN_SECONDS;
}

function clean_text($v): string
{
    $v = trim(str_replace("\r\n", "\n", (string) $v));
    return function_exists('mb_substr') ? mb_substr($v, 0, TEXT_MAX) : substr($v, 0, TEXT_MAX);
}

/**
 * Reads the posted answers against questions(). Returns [answers, errors]; answers hold only
 * allowed values, errors map question id => message.
 */
function read_answers(array $post): array
{
    $answers = [];
    $errors = [];
    foreach (questions() as $q) {
        $id = $q['id'];
        $raw = $post[$id] ?? null;
        $value = null;
        switch ($q['type']) {
            case 'radio':
                if (is_string($raw) && isset($q['options'][$raw])) {
                    $value = $raw;
                }
                break;
            case 'checkbox':
                $value = [];
                if (is_array($raw)) {
                    foreach ($raw as $r) {
                        if (is_string($r) && isset($q['options'][$r]) && !in_array($r, $value, true)) {
                            $value[] = $r;
                        }
                    }
                }
                break;
            case 'scale':
                if (is_string($raw) && in_array($raw, ['1', '2', '3', '4', '5'], true)) {
                    $value = (int) $raw;
                }
                break;
            case 'textarea':
                $value = is_string($raw) ? clean_text($raw) : '';
                break;
            case 'email':
                $value = is_string($raw) ? trim($raw) : '';
                if ($value !== '' && filter_var($value, FILTER_VALIDATE_EMAIL) === false) {
                    $errors[$id] = 'That doesn’t look like an email address. Fix it or leave it blank.';
                }
                $value = substr($value, 0, 254);
                break;
        }
        if (!empty($q['required']) && ($value === null || $value === '' || $value === [])) {
            $errors[$id] = 'Please pick one.';
        }
        $answers[$id] = $value;
    }
    return [$answers, $errors];
}

function save_response(array $answers): bool
{
    $row = ['ts' => gmdate('c')] + $answers;
    // JSON_HEX_TAG escapes < and >, so no answer can ever open a PHP tag in the file.
    $line = json_encode($row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG) . "\n";
    $fh = @fopen(RESPONSES_FILE, 'a');
    if (!$fh) {
        return false;
    }
    flock($fh, LOCK_EX);
    clearstatcache(true, RESPONSES_FILE);
    $ok = (filesize(RESPONSES_FILE) > 0 || fwrite($fh, RESPONSES_GUARD) !== false)
        && fwrite($fh, $line) !== false;
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    return $ok;
}

function load_responses(): array
{
    if (!is_readable(RESPONSES_FILE)) {
        return [];
    }
    $fh = fopen(RESPONSES_FILE, 'r');
    if (!$fh) {
        return [];
    }
    flock($fh, LOCK_SH);
    $rows = [];
    while (($line = fgets($fh)) !== false) {
        if (strncmp($line, '<?php', 5) === 0) {
            continue; // the guard line
        }
        $row = json_decode($line, true);
        if (is_array($row)) {
            $rows[] = $row;
        }
    }
    flock($fh, LOCK_UN);
    fclose($fh);
    return $rows;
}

function page_head(string $title, string $extra = ''): void
{
    ?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title><?= h($title) ?></title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<link rel="stylesheet" href="style.css?v=1">
<?= $extra ?>
</head>
<body>
<?php
}
