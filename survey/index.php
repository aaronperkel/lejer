<?php
require __DIR__ . '/lib.php';

$answers = [];
$errors = [];
$saveFailed = false;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $bot = ($_POST['website'] ?? '') !== '' || !token_ok((string) ($_POST['t'] ?? ''));
    [$answers, $errors] = read_answers($_POST);
    if ($bot) {
        // Look like success so a bot has nothing to learn; nothing is written.
        header('Location: ?done=1', true, 303);
        exit;
    }
    if (!$errors) {
        if (save_response($answers)) {
            header('Location: ?done=1', true, 303);
            exit;
        }
        $saveFailed = true;
    }
}

$done = isset($_GET['done']);
$num = 0;

page_head('Splitting bills with roommates');
?>
<main class="wrap">
  <header class="intro">
    <p class="eyebrow">Lejer &middot; quick survey</p>
    <h1>Splitting bills with roommates</h1>
<?php if ($done): ?>
  </header>
  <section class="panel thanks" aria-live="polite">
    <p class="figure">Thanks!</p>
    <p>That’s everything. Your answers help decide what gets built first.</p>
    <p class="muted">Know someone who splits rent or utilities? Send them this page.</p>
  </section>
<?php else: ?>
    <p class="lede">I’m building a small web app for households that share bills. Someone posts a
      bill, everyone sees their share, it keeps track of who’s paid, and it emails a reminder
      before the due date. No more spreadsheets or chasing people in the group chat.</p>
    <p class="muted">About two minutes. Only the two questions marked <span class="req">required</span> are required.</p>
  </header>

<?php if ($saveFailed): ?>
  <p class="flash flash-err" role="alert">Sorry, your answers couldn’t be saved just now. Please try again in a minute.</p>
<?php elseif ($errors): ?>
  <p class="flash flash-err" role="alert">A couple of answers need another look; they’re marked below.</p>
<?php endif; ?>

  <form method="post" action="" novalidate>
    <input type="hidden" name="t" value="<?= h(form_token()) ?>">
    <div class="hp" aria-hidden="true">
      <label>Leave this empty <input type="text" name="website" tabindex="-1" autocomplete="off"></label>
    </div>

<?php foreach (questions() as $q):
    $num++;
    $id = $q['id'];
    $val = $answers[$id] ?? null;
    $err = $errors[$id] ?? null;
    $req = !empty($q['required']);
    $describedBy = trim((isset($q['help']) ? "$id-help " : '') . ($err ? "$id-err" : ''));
    $isGroup = in_array($q['type'], ['radio', 'checkbox', 'scale'], true);
?>
<?php if (isset($q['section'])): ?>
    <h2 class="section"><?= h($q['section']) ?></h2>
<?php endif; ?>
<?php if (isset($q['intro'])): ?>
    <div class="note"><?= $q['intro'] /* trusted: written in lib.php */ ?></div>
<?php endif; ?>
    <<?= $isGroup ? 'fieldset' : 'div' ?> class="panel q<?= $err ? ' has-err' : '' ?>" id="q-<?= h($id) ?>"<?= $describedBy && $isGroup ? ' aria-describedby="' . h($describedBy) . '"' : '' ?>>
      <<?= $isGroup ? 'legend' : 'label for="f-' . h($id) . '"' ?> class="q-label">
        <span class="q-num"><?= sprintf('%02d', $num) ?></span>
        <span><?= h($q['label']) ?><?php if ($req): ?> <span class="req">required</span><?php endif; ?></span>
      </<?= $isGroup ? 'legend' : 'label' ?>>
<?php if (isset($q['help'])): ?>
      <p class="help" id="<?= h($id) ?>-help"><?= h($q['help']) ?></p>
<?php endif; ?>
<?php if ($err): ?>
      <p class="field-err" id="<?= h($id) ?>-err"><?= h($err) ?></p>
<?php endif; ?>

<?php if ($q['type'] === 'radio' || $q['type'] === 'checkbox'):
    $multi = $q['type'] === 'checkbox'; ?>
      <div class="choices">
<?php foreach ($q['options'] as $value => $label):
    $value = (string) $value; // PHP turns numeric keys like "1" into ints
    $checked = $multi ? (is_array($val) && in_array($value, $val, true)) : $val === $value; ?>
        <label class="choice">
          <input type="<?= $multi ? 'checkbox' : 'radio' ?>" name="<?= h($id) . ($multi ? '[]' : '') ?>" value="<?= h($value) ?>"<?= $checked ? ' checked' : '' ?><?= $req && !$multi ? ' required' : '' ?>>
          <span><?= h($label) ?></span>
        </label>
<?php endforeach; ?>
      </div>

<?php elseif ($q['type'] === 'scale'): ?>
      <div class="scale">
        <div class="scale-row">
<?php for ($i = 1; $i <= 5; $i++): ?>
          <label class="scale-pt">
            <input type="radio" name="<?= h($id) ?>" value="<?= $i ?>"<?= $val === $i ? ' checked' : '' ?><?= $req ? ' required' : '' ?>>
            <span><?= $i ?></span>
          </label>
<?php endfor; ?>
        </div>
        <div class="scale-ends" aria-hidden="true"><span>1 &middot; <?= h($q['ends'][0]) ?></span><span><?= h($q['ends'][1]) ?> &middot; 5</span></div>
        <p class="sr-only">1 means <?= h($q['ends'][0]) ?>, 5 means <?= h($q['ends'][1]) ?>.</p>
      </div>

<?php elseif ($q['type'] === 'textarea'): ?>
      <textarea id="f-<?= h($id) ?>" name="<?= h($id) ?>" rows="3" maxlength="<?= TEXT_MAX ?>" placeholder="<?= h($q['placeholder'] ?? '') ?>"<?= $describedBy ? ' aria-describedby="' . h($describedBy) . '"' : '' ?>><?= h($val ?? '') ?></textarea>

<?php elseif ($q['type'] === 'email'): ?>
      <input class="text" type="email" id="f-<?= h($id) ?>" name="<?= h($id) ?>" value="<?= h($val ?? '') ?>" placeholder="<?= h($q['placeholder'] ?? '') ?>" autocomplete="email" inputmode="email" maxlength="254"<?= $describedBy ? ' aria-describedby="' . h($describedBy) . '"' : '' ?><?= $err ? ' aria-invalid="true"' : '' ?>>
<?php endif; ?>
    </<?= $isGroup ? 'fieldset' : 'div' ?>>
<?php endforeach; ?>

    <div class="submit">
      <button type="submit" class="btn">Send my answers</button>
      <p class="muted">Answers are anonymous unless you leave an email.</p>
    </div>
  </form>
<?php endif; ?>
</main>
<?php if ($errors): ?>
<script>
  // Take people straight to the first answer that needs fixing.
  var first = document.querySelector('.has-err');
  if (first) {
    first.scrollIntoView({ block: 'center' });
    var input = first.querySelector('input, textarea');
    if (input) input.focus({ preventScroll: true });
  }
</script>
<?php endif; ?>
</body>
</html>
