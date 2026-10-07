<?php
require __DIR__ . '/lib.php';

header('X-Robots-Tag: noindex');
header('Cache-Control: no-store');

$configured = is_readable(__DIR__ . '/config.php');
if ($configured) {
    require __DIR__ . '/config.php';
    $configured = defined('RESULTS_PASSWORD') && RESULTS_PASSWORD !== '' && RESULTS_PASSWORD !== 'change-me';
}

if (!$configured) {
    http_response_code(503);
    page_head('Survey results');
    ?>
<main class="wrap">
  <p class="eyebrow">Survey results</p>
  <h1>Set a password first</h1>
  <div class="panel">
    <p>Copy <code>config.sample.php</code> to <code>config.php</code> in this folder and set
      <code>RESULTS_PASSWORD</code> to something long. Then reload this page.</p>
  </div>
</main>
</body></html>
<?php
    exit;
}

session_name('survey_results');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => dirname($_SERVER['SCRIPT_NAME']) ?: '/',
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_start();

$loginError = false;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_POST['logout'])) {
        $_SESSION = [];
        session_destroy();
        header('Location: results.php', true, 303);
        exit;
    }
    if (hash_equals(RESULTS_PASSWORD, (string) ($_POST['password'] ?? ''))) {
        session_regenerate_id(true);
        $_SESSION['ok'] = true;
        header('Location: results.php', true, 303);
        exit;
    }
    sleep(1);
    $loginError = true;
}

if (empty($_SESSION['ok'])) {
    page_head('Survey results');
    ?>
<main class="wrap">
  <p class="eyebrow">Survey results</p>
  <h1>Sign in</h1>
<?php if ($loginError): ?>
  <p class="flash flash-err" role="alert">That’s not the password.</p>
<?php endif; ?>
  <form method="post" class="panel login">
    <label for="pw">Password</label>
    <input class="text" type="password" id="pw" name="password" autocomplete="current-password" autofocus required>
    <button type="submit" class="btn">Show results</button>
  </form>
</main>
</body></html>
<?php
    exit;
}

$rows = load_responses();
$qs = questions();

/** Spreadsheets run cells starting with these as formulas; quote them. */
function csv_cell($v): string
{
    $v = (string) $v;
    return ($v !== '' && strpos('=+-@', $v[0]) !== false) ? "'" . $v : $v;
}

if (isset($_GET['csv'])) {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="survey-' . gmdate('Y-m-d') . '.csv"');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF"); // BOM so Excel reads UTF-8
    $header = ['submitted_utc'];
    foreach ($qs as $q) {
        $header[] = $q['id'];
    }
    fputcsv($out, $header, ',', '"', '');
    foreach ($rows as $r) {
        $line = [$r['ts'] ?? ''];
        foreach ($qs as $q) {
            $v = $r[$q['id']] ?? '';
            if (is_array($v)) {
                $labels = [];
                foreach ($v as $x) {
                    $labels[] = $q['options'][$x] ?? $x;
                }
                $v = implode('; ', $labels);
            } elseif (isset($q['options'][$v])) {
                $v = $q['options'][$v];
            }
            $line[] = csv_cell($v);
        }
        fputcsv($out, $line, ',', '"', '');
    }
    fclose($out);
    exit;
}

$total = count($rows);

/** Counts per option (radio/checkbox) or per point (scale), plus how many answered at all. */
function tally(array $q, array $rows): array
{
    $keys = $q['type'] === 'scale' ? [1, 2, 3, 4, 5] : array_keys($q['options']);
    $counts = array_fill_keys($keys, 0);
    $answered = 0;
    $sum = 0;
    foreach ($rows as $r) {
        $v = $r[$q['id']] ?? null;
        if ($v === null || $v === '' || $v === []) {
            continue;
        }
        $answered++;
        foreach ((array) $v as $x) {
            if (array_key_exists($x, $counts)) {
                $counts[$x]++;
                if ($q['type'] === 'scale') {
                    $sum += (int) $x;
                }
            }
        }
    }
    if ($q['type'] === 'checkbox') {
        arsort($counts);
    }
    return [$counts, $answered, $q['type'] === 'scale' && $answered ? $sum / $answered : null];
}

$byId = [];
foreach ($qs as $q) {
    $byId[$q['id']] = $q;
}
[$useCounts, $useAnswered] = tally($byId['would_use'], $rows);
$yes = $useCounts['definitely'] + $useCounts['probably'];
[, , $nameAvg] = tally($byId['name_appeal'], $rows);
$emails = [];
foreach ($rows as $r) {
    if (!empty($r['email'])) {
        $emails[] = $r['email'];
    }
}
$emails = array_values(array_unique($emails));

page_head('Survey results');
?>
<main class="wrap wrap-wide">
  <p class="eyebrow">Survey results</p>
  <h1>What people said</h1>
  <div class="toolbar">
    <p class="muted"><?= $total ?> response<?= $total === 1 ? '' : 's' ?></p>
    <a class="btn btn-quiet btn-sm" href="?csv=1">Download CSV</a>
    <form method="post"><button class="btn btn-quiet btn-sm" name="logout" value="1">Sign out</button></form>
  </div>

<?php if (!$total): ?>
  <div class="panel"><p class="muted">No responses yet.</p></div>
<?php else: ?>
  <div class="stats">
    <div class="panel stat"><span class="data-label">Responses</span><span class="figure"><?= $total ?></span></div>
    <div class="panel stat"><span class="data-label">Would use</span><span class="figure"><?= $useAnswered ? round(100 * $yes / $useAnswered) : 0 ?>%</span><span class="muted">definitely or probably</span></div>
    <div class="panel stat"><span class="data-label">Name appeal</span><span class="figure"><?= $nameAvg === null ? '–' : number_format($nameAvg, 1) ?><small class="muted"> / 5</small></span></div>
    <div class="panel stat"><span class="data-label">Want an invite</span><span class="figure"><?= count($emails) ?></span></div>
  </div>

<?php foreach ($qs as $q):
    if ($q['id'] === 'email') {
        continue;
    } ?>
  <section class="panel">
    <h2 class="q-label"><?= h($q['label']) ?></h2>
<?php if ($q['type'] === 'textarea'):
    $texts = array_values(array_filter($rows, function ($r) use ($q) {
        return !empty($r[$q['id']]);
    })); ?>
<?php if (!$texts): ?>
    <p class="muted">Nobody wrote anything yet.</p>
<?php else: ?>
    <ul class="texts">
<?php foreach (array_reverse($texts) as $r): ?>
      <li><time datetime="<?= h($r['ts'] ?? '') ?>"><?= h(substr($r['ts'] ?? '', 0, 10)) ?></time><?= h($r[$q['id']]) ?></li>
<?php endforeach; ?>
    </ul>
<?php endif; ?>
<?php else:
    [$counts, $answered, $avg] = tally($q, $rows); ?>
    <p class="help"><?= $answered ?> answered<?= $avg !== null ? ' &middot; average ' . number_format($avg, 1) . ' (1 = ' . h($q['ends'][0]) . ', 5 = ' . h($q['ends'][1]) . ')' : '' ?><?= $q['type'] === 'checkbox' ? ' &middot; could pick several' : '' ?></p>
    <div class="bars">
<?php foreach ($counts as $key => $n):
    $label = $q['type'] === 'scale' ? (string) $key : $q['options'][$key];
    $pct = $answered ? round(100 * $n / $answered) : 0; ?>
      <div class="bar-row">
        <span><?= h($label) ?></span>
        <span class="count"><?= $n ?> &middot; <?= $pct ?>%</span>
        <div class="bar"><i style="width: <?= $pct ?>%"></i></div>
      </div>
<?php endforeach; ?>
    </div>
<?php endif; ?>
  </section>
<?php endforeach; ?>

  <section class="panel">
    <h2 class="q-label">Invite list</h2>
<?php if (!$emails): ?>
    <p class="muted">No emails yet.</p>
<?php else: ?>
    <p class="help"><?= count($emails) ?> address<?= count($emails) === 1 ? '' : 'es' ?>, ready to paste.</p>
    <textarea readonly rows="<?= min(10, count($emails) + 1) ?>"><?= h(implode(', ', $emails)) ?></textarea>
<?php endif; ?>
  </section>
<?php endif; ?>
</main>
</body>
</html>
