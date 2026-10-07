# Interest survey

A one-page PHP survey for gauging interest in Lejer, hosted on UVM silk at
`https://aperkel.w3.uvm.edu/survey/`. Standalone: no build, no database, PHP 7.4+. Not part of
the Next.js app (the `brand` verify suite and `tsconfig` don't look in here).

| File | |
|---|---|
| `index.php` | The survey |
| `results.php` | Password-protected tallies, free-text answers, invite list, CSV download |
| `lib.php` | The question list (edit questions here; the form, results and CSV follow) and helpers |
| `style.css` | The app's statement theme as plain CSS, light and dark |
| `config.sample.php` | Copy to `config.php` and set the results password |
| `data/` | Responses (`responses.php`) and the form secret (`secret.php`), created on first submit |

## Deploy

1. Upload the whole `survey/` folder into your silk web root (`www-root/`), e.g.
   `scp -r survey aperkel@silk.uvm.edu:www-root/` (or any SFTP client).
2. On silk, `cp config.sample.php config.php` inside the folder and set `RESULTS_PASSWORD`.
   Don't re-upload `config.php` or `data/` later; they hold the live password and responses.
3. Open the survey, submit a test response, then check `results.php`. If the survey says
   answers couldn't be saved, PHP can't write to `data/`: `chmod 755 data` (or `775`/`777`
   if silk runs PHP as a different user than you).
4. Confirm `https://aperkel.w3.uvm.edu/survey/data/responses.php` shows nothing (404/403).
   The data is protected twice: `data/.htaccess` denies the folder, and each data file starts
   with a PHP line that exits before any data, so it stays hidden even if `.htaccess` is
   ignored.
5. Delete the test response: edit `data/responses.php` and remove its line (keep the first
   `<?php … ?>` line).

## Data

`data/responses.php` is one JSON object per line after the guard line: `ts` (UTC) plus one key
per question id in `lib.php`. Multi-selects are arrays of option keys; the CSV export swaps in
the option labels. No IP addresses or cookies are stored for respondents. Spam control is a
hidden honeypot field and a signed page-load timestamp (submits faster than 3 seconds are
dropped silently).
