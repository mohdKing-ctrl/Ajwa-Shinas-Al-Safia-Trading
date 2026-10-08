<?php
/*
 * Ajwa Shinas POS - server API
 * ---------------------------------------------------------------
 * One small file. Stores everything in a SQLite database inside ../data
 * (no MySQL setup needed). Needs PHP 8.1+ with pdo_sqlite (Hostinger has both).
 *
 * Every request is JSON in / JSON out:   api/?action=NAME
 * Writes are POST and must carry the header  X-Requested-With: ajwa-pos
 * (browsers refuse to send a custom header from another website, which is
 * what blocks cross-site request forgery).
 */
declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);
date_default_timezone_set('Asia/Muscat');

const DATA_DIR    = __DIR__ . '/../data';
const DB_FILE     = DATA_DIR . '/ajwa-pos.sqlite';
const COLLECTIONS = ['settings', 'services', 'customers', 'invoices'];
const MAX_BODY    = 12 * 1024 * 1024;      // restore files can be large
const MAX_DOC     = 300 * 1024;            // one invoice / customer / service

/* ---------------------------------------------------------- output */
function out(array $d, int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
    exit;
}
function fail(string $error, int $code = 400): never
{
    out(['ok' => false, 'error' => $error], $code);
}

set_exception_handler(function (Throwable $e): void {
    error_log('[ajwa-pos] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    fail('server_error', 500);
});

/* ---------------------------------------------------------- database */
function db(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;

    if (!is_dir(DATA_DIR) && !@mkdir(DATA_DIR, 0750, true)) fail('data_dir_missing', 500);
    if (!is_writable(DATA_DIR)) fail('data_dir_not_writable', 500);

    $pdo = new PDO('sqlite:' . DB_FILE, null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA busy_timeout = 8000');
    $pdo->exec('CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        pass TEXT NOT NULL,
        created INTEGER NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS docs (
        col TEXT NOT NULL,
        id TEXT NOT NULL,
        json TEXT NOT NULL,
        updated INTEGER NOT NULL,
        PRIMARY KEY (col, id))');
    $pdo->exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS attempts (ip TEXT NOT NULL, ts INTEGER NOT NULL)');
    return $pdo;
}

function meta_get(string $k, string $default = ''): string
{
    $st = db()->prepare('SELECT v FROM meta WHERE k = ?');
    $st->execute([$k]);
    $v = $st->fetchColumn();
    return $v === false ? $default : (string)$v;
}
function meta_set(string $k, string $v): void
{
    db()->prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')->execute([$k, $v]);
}

/* ---------------------------------------------------------- session / auth */
function start_session(): void
{
    $sessDir = DATA_DIR . '/sessions';
    if (!is_dir($sessDir)) @mkdir($sessDir, 0750, true);
    if (is_dir($sessDir) && is_writable($sessDir)) session_save_path($sessDir);

    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
          || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

    ini_set('session.gc_maxlifetime', '43200');           // stay signed in for a 12 h working day
    ini_set('session.use_strict_mode', '1');
    session_name('ajwa_pos');
    session_set_cookie_params([
        'lifetime' => 0, 'path' => '/', 'secure' => $https,
        'httponly' => true, 'samesite' => 'Strict',
    ]);
    session_start();
}

function current_user(): ?array
{
    if (empty($_SESSION['uid'])) return null;
    $st = db()->prepare('SELECT id, username, name, role FROM users WHERE id = ?');
    $st->execute([(int)$_SESSION['uid']]);
    $u = $st->fetch();
    return $u ?: null;
}
function require_user(): array
{
    $u = current_user();
    if (!$u) fail('not_logged_in', 401);
    return $u;
}
function require_admin(): array
{
    $u = require_user();
    if ($u['role'] !== 'admin') fail('admin_only', 403);
    return $u;
}
function user_count(): int
{
    return (int)db()->query('SELECT COUNT(*) FROM users')->fetchColumn();
}
function login_as(array $u): void
{
    session_regenerate_id(true);
    $_SESSION['uid'] = (int)$u['id'];
}
function client_ip(): string
{
    return substr((string)($_SERVER['REMOTE_ADDR'] ?? '0'), 0, 64);
}
function public_user(array $u): array
{
    return ['id' => (int)$u['id'], 'username' => $u['username'], 'name' => $u['name'], 'role' => $u['role']];
}

/* ---------------------------------------------------------- request */
$action = (string)($_GET['action'] ?? '');
$isPost = ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST';
$body   = [];

if ($isPost) {
    if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'ajwa-pos') fail('bad_request', 403);
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > MAX_BODY) fail('too_large', 413);
    $raw = file_get_contents('php://input', false, null, 0, MAX_BODY + 1);
    if ($raw !== '' && $raw !== false) {
        $body = json_decode($raw, true);
        if (!is_array($body)) fail('bad_json');
    }
}

start_session();

/* ---------------------------------------------------------- helpers */
function check_doc(mixed $doc, string $col): array
{
    if (!is_array($doc)) fail('bad_doc');
    if (strlen(json_encode($doc, JSON_UNESCAPED_UNICODE)) > MAX_DOC) fail('doc_too_large', 413);
    if ($col !== 'settings') {
        $id = (string)($doc['id'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id)) fail('bad_id');
        $doc['id'] = $id;
    }
    return $doc;
}
function save_doc(string $col, string $id, array $doc): void
{
    db()->prepare('INSERT INTO docs (col, id, json, updated) VALUES (?, ?, ?, ?)
                   ON CONFLICT(col, id) DO UPDATE SET json = excluded.json, updated = excluded.updated')
        ->execute([$col, $id, json_encode($doc, JSON_UNESCAPED_UNICODE), time()]);
}
function get_doc(string $col, string $id): ?array
{
    $st = db()->prepare('SELECT json FROM docs WHERE col = ? AND id = ?');
    $st->execute([$col, $id]);
    $j = $st->fetchColumn();
    return $j === false ? null : json_decode((string)$j, true);
}
function col_name(mixed $c): string
{
    $c = (string)$c;
    if (!in_array($c, COLLECTIONS, true)) fail('bad_collection');
    return $c;
}
function can_write(string $col, array $user): bool
{
    if ($user['role'] === 'admin') return true;
    return in_array($col, ['customers', 'invoices'], true);   // cashiers: customers + invoices only
}
function pad_number(int $n, string $prefix): string
{
    return $prefix . '-' . str_pad((string)$n, 5, '0', STR_PAD_LEFT);
}
function invoice_prefix(): string
{
    $s = get_doc('settings', 'main');
    $p = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)($s['prefix'] ?? 'INV')));
    return $p !== '' ? substr($p, 0, 8) : 'INV';
}
function check_password(string $p): void
{
    if (strlen($p) < 8) fail('password_short');
    if (strlen($p) > 200) fail('password_long');
}

/* ---------------------------------------------------------- actions */
switch ($action) {

    /* ---- who am I / is this a brand-new install --------------- */
    case 'status': {
        $u = current_user();
        out(['ok' => true, 'setup_needed' => user_count() === 0, 'user' => $u ? public_user($u) : null]);
    }

    /* ---- first run: create the owner account ------------------ */
    case 'setup': {
        if (!$isPost) fail('post_only', 405);
        if (user_count() > 0) fail('already_setup', 403);
        $username = strtolower(trim((string)($body['username'] ?? '')));
        $name     = trim((string)($body['name'] ?? ''));
        $pass     = (string)($body['password'] ?? '');
        if (!preg_match('/^[a-z0-9._-]{3,32}$/', $username)) fail('bad_username');
        if ($name === '') $name = $username;
        check_password($pass);
        db()->prepare('INSERT INTO users (username, name, role, pass, created) VALUES (?, ?, ?, ?, ?)')
            ->execute([$username, mb_substr($name, 0, 80), 'admin', password_hash($pass, PASSWORD_DEFAULT), time()]);
        $u = ['id' => (int)db()->lastInsertId(), 'username' => $username, 'name' => $name, 'role' => 'admin'];
        login_as($u);
        out(['ok' => true, 'user' => public_user($u)]);
    }

    case 'login': {
        if (!$isPost) fail('post_only', 405);
        $ip = client_ip();
        db()->prepare('DELETE FROM attempts WHERE ts < ?')->execute([time() - 900]);
        $st = db()->prepare('SELECT COUNT(*) FROM attempts WHERE ip = ?');
        $st->execute([$ip]);
        if ((int)$st->fetchColumn() >= 8) fail('too_many_attempts', 429);

        $username = strtolower(trim((string)($body['username'] ?? '')));
        $pass     = (string)($body['password'] ?? '');
        $st = db()->prepare('SELECT * FROM users WHERE username = ?');
        $st->execute([$username]);
        $u = $st->fetch();
        // Always run a hash check so a wrong username takes as long as a wrong password.
        $hash = $u ? $u['pass'] : '$2y$10$usesomesillystringforsaltuOpXu0m3FZ0e1hFZ4c3dG8hS8pWb6';
        $good = password_verify($pass, $hash) && $u;
        if (!$good) {
            db()->prepare('INSERT INTO attempts (ip, ts) VALUES (?, ?)')->execute([$ip, time()]);
            fail('bad_login', 401);
        }
        db()->prepare('DELETE FROM attempts WHERE ip = ?')->execute([$ip]);
        if (password_needs_rehash($u['pass'], PASSWORD_DEFAULT)) {
            db()->prepare('UPDATE users SET pass = ? WHERE id = ?')->execute([password_hash($pass, PASSWORD_DEFAULT), $u['id']]);
        }
        login_as($u);
        out(['ok' => true, 'user' => public_user($u)]);
    }

    case 'logout': {
        if (!$isPost) fail('post_only', 405);
        $_SESSION = [];
        session_destroy();
        out(['ok' => true]);
    }

    /* ---- everything the app needs at start-up ----------------- */
    case 'load': {
        $user = require_user();
        $res = ['ok' => true, 'user' => public_user($user), 'settings' => null,
                'services' => [], 'customers' => [], 'invoices' => [], 'counter' => (int)meta_get('counter', '0')];
        foreach (db()->query('SELECT col, id, json FROM docs ORDER BY rowid')->fetchAll() as $r) {
            $d = json_decode($r['json'], true);
            if (!is_array($d)) continue;
            if ($r['col'] === 'settings') { if ($r['id'] === 'main') $res['settings'] = $d; }
            elseif (isset($res[$r['col']])) $res[$r['col']][] = $d;
        }
        out($res);
    }

    /* ---- create / update one record ---------------------------- */
    case 'put': {
        if (!$isPost) fail('post_only', 405);
        $user = require_user();
        $col  = col_name($body['col'] ?? '');
        if (!can_write($col, $user)) fail('admin_only', 403);
        $doc = check_doc($body['doc'] ?? null, $col);
        $id  = $col === 'settings' ? 'main' : $doc['id'];

        if ($col === 'invoices') {
            // Invoices are only ever created by create_invoice; here we update.
            // The number, id and creation info can never be changed by the browser.
            $old = get_doc('invoices', $id);
            if (!$old) fail('not_found', 404);
            foreach (['id', 'no', 'number', 'created', 'createdBy'] as $k) {
                if (array_key_exists($k, $old)) $doc[$k] = $old[$k];
            }
            if ($user['role'] !== 'admin') {
                // A cashier may only add payments and move the job stage forward -
                // never change amounts, items, customer, or void an invoice.
                $oldPay = is_array($old['payments'] ?? null) ? $old['payments'] : [];
                $newPay = is_array($doc['payments'] ?? null) ? $doc['payments'] : [];
                if (!empty($old['void']) || array_slice($newPay, 0, count($oldPay)) != $oldPay) fail('admin_only', 403);
                foreach (array_slice($newPay, count($oldPay)) as $p) {
                    if (!is_array($p) || !is_numeric($p['amount'] ?? null) || (float)$p['amount'] <= 0) fail('bad_doc');
                }
                $job = (string)($doc['job'] ?? '');
                $merged = $old;
                $merged['payments'] = $newPay;
                $merged['job'] = in_array($job, ['progress', 'cleared', 'done'], true) ? $job : ($old['job'] ?? 'progress');
                $doc = $merged;
            }
        }
        save_doc($col, $id, $doc);
        out(['ok' => true, 'doc' => $doc]);
    }

    /* ---- new invoice: the server hands out the next number ----- */
    case 'create_invoice': {
        if (!$isPost) fail('post_only', 405);
        $user = require_user();
        $doc = $body['doc'] ?? null;
        if (!is_array($doc) || !is_array($doc['items'] ?? null) || count($doc['items']) < 1) fail('bad_doc');
        if (strlen(json_encode($doc, JSON_UNESCAPED_UNICODE)) > MAX_DOC) fail('doc_too_large', 413);

        $pdo = db();
        $pdo->exec('BEGIN IMMEDIATE');
        try {
            $n = (int)meta_get('counter', '0') + 1;
            meta_set('counter', (string)$n);
            $doc['no']        = $n;
            $doc['id']        = (string)$n;
            $doc['number']    = pad_number($n, invoice_prefix());
            $doc['created']   = time();
            $doc['createdBy'] = $user['name'];
            save_doc('invoices', $doc['id'], $doc);
            $pdo->exec('COMMIT');
        } catch (Throwable $e) {
            $pdo->exec('ROLLBACK');
            throw $e;
        }
        out(['ok' => true, 'doc' => $doc, 'counter' => $n]);
    }

    case 'del': {
        if (!$isPost) fail('post_only', 405);
        $user = require_user();
        $col  = col_name($body['col'] ?? '');
        if ($col === 'settings') fail('bad_collection');
        // Cashiers can add customers but only the owner can delete anything.
        if ($user['role'] !== 'admin') fail('admin_only', 403);
        $id = (string)($body['id'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id)) fail('bad_id');
        db()->prepare('DELETE FROM docs WHERE col = ? AND id = ?')->execute([$col, $id]);
        out(['ok' => true]);
    }

    /* ---- delete several bills at once (owner only) ------------- */
    case 'del_many': {
        if (!$isPost) fail('post_only', 405);
        require_admin();
        $ids = $body['ids'] ?? null;
        if (!is_array($ids) || count($ids) < 1 || count($ids) > 1000) fail('bad_id');
        foreach ($ids as $id) {
            if (!is_string($id) || !preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id)) fail('bad_id');
        }
        $pdo = db();
        $pdo->exec('BEGIN IMMEDIATE');
        try {
            $st = $pdo->prepare("DELETE FROM docs WHERE col = 'invoices' AND id = ?");
            foreach ($ids as $id) $st->execute([$id]);
            $pdo->exec('COMMIT');
        } catch (Throwable $e) { $pdo->exec('ROLLBACK'); throw $e; }
        // The invoice counter is deliberately left alone: a deleted number is never handed out again.
        out(['ok' => true, 'deleted' => count($ids)]);
    }

    /* ---- replace a whole list (used by "reset price list") ------ */
    case 'replace': {
        if (!$isPost) fail('post_only', 405);
        require_admin();
        $col = col_name($body['col'] ?? '');
        if (!in_array($col, ['services', 'customers'], true)) fail('bad_collection');
        $docs = $body['docs'] ?? null;
        if (!is_array($docs)) fail('bad_doc');
        $pdo = db();
        $pdo->exec('BEGIN IMMEDIATE');
        try {
            $pdo->prepare('DELETE FROM docs WHERE col = ?')->execute([$col]);
            foreach ($docs as $d) { $d = check_doc($d, $col); save_doc($col, $d['id'], $d); }
            $pdo->exec('COMMIT');
        } catch (Throwable $e) { $pdo->exec('ROLLBACK'); throw $e; }
        out(['ok' => true]);
    }

    /* ---- whole-database restore / sample data / wipe ----------- */
    case 'restore': {
        if (!$isPost) fail('post_only', 405);
        require_admin();
        $data = $body['data'] ?? null;
        if (!is_array($data) || !is_array($data['invoices'] ?? null)) fail('bad_backup');
        $pdo = db();
        $pdo->exec('BEGIN IMMEDIATE');
        try {
            $pdo->exec("DELETE FROM docs");
            if (is_array($data['settings'] ?? null)) save_doc('settings', 'main', $data['settings']);
            $maxNo = 0;
            foreach (['services', 'customers', 'invoices'] as $col) {
                foreach (($data[$col] ?? []) as $d) {
                    $d = check_doc($d, $col);
                    if ($col === 'invoices') $maxNo = max($maxNo, (int)($d['no'] ?? 0));
                    save_doc($col, $d['id'], $d);
                }
            }
            meta_set('counter', (string)max((int)($data['counter'] ?? 0), $maxNo));
            $pdo->exec('COMMIT');
        } catch (Throwable $e) { $pdo->exec('ROLLBACK'); throw $e; }
        out(['ok' => true]);
    }

    case 'reset': {
        if (!$isPost) fail('post_only', 405);
        require_admin();
        db()->exec('DELETE FROM docs');
        if (!empty($body['resetCounter'])) meta_set('counter', '0');
        out(['ok' => true]);
    }

    /* ---- staff accounts ---------------------------------------- */
    case 'users': {
        require_admin();
        $rows = db()->query('SELECT id, username, name, role FROM users ORDER BY id')->fetchAll();
        out(['ok' => true, 'users' => array_map('public_user', $rows)]);
    }

    case 'user_add': {
        if (!$isPost) fail('post_only', 405);
        require_admin();
        $username = strtolower(trim((string)($body['username'] ?? '')));
        $name     = trim((string)($body['name'] ?? ''));
        $role     = ($body['role'] ?? 'cashier') === 'admin' ? 'admin' : 'cashier';
        $pass     = (string)($body['password'] ?? '');
        if (!preg_match('/^[a-z0-9._-]{3,32}$/', $username)) fail('bad_username');
        check_password($pass);
        $st = db()->prepare('SELECT 1 FROM users WHERE username = ?');
        $st->execute([$username]);
        if ($st->fetchColumn()) fail('username_taken', 409);
        db()->prepare('INSERT INTO users (username, name, role, pass, created) VALUES (?, ?, ?, ?, ?)')
            ->execute([$username, mb_substr($name !== '' ? $name : $username, 0, 80), $role, password_hash($pass, PASSWORD_DEFAULT), time()]);
        out(['ok' => true]);
    }

    case 'user_del': {
        if (!$isPost) fail('post_only', 405);
        $me = require_admin();
        $id = (int)($body['id'] ?? 0);
        if ($id === (int)$me['id']) fail('cannot_delete_self');
        db()->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
        out(['ok' => true]);
    }

    case 'user_password': {
        if (!$isPost) fail('post_only', 405);
        $me = require_user();
        $pass = (string)($body['password'] ?? '');
        check_password($pass);
        $targetId = (int)($body['id'] ?? $me['id']);
        if ($targetId !== (int)$me['id']) {
            require_admin();                                   // only the owner can reset someone else
        } else {
            $st = db()->prepare('SELECT pass FROM users WHERE id = ?');
            $st->execute([$me['id']]);
            if (!password_verify((string)($body['old'] ?? ''), (string)$st->fetchColumn())) fail('bad_login', 401);
        }
        db()->prepare('UPDATE users SET pass = ? WHERE id = ?')->execute([password_hash($pass, PASSWORD_DEFAULT), $targetId]);
        out(['ok' => true]);
    }

    default:
        fail('unknown_action', 404);
}
