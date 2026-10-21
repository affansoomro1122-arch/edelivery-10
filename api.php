<?php
/**
 * SKY EV – products API (PHP + MySQL on your GoDaddy hosting)
 *   GET  api.php?action=list      -> public product list
 *   POST api.php  {action:'check'|'save'|'upload', pin:'...'}  -> admin only (passcode in config.php)
 * The tables are created automatically on the first request.
 */
ini_set('display_errors', '0');
error_reporting(E_ALL);
require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');              // lets the site be hosted on another domain while the data stays here
header('Access-Control-Allow-Headers: Content-Type');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { exit; }

function out($d, $code = 200) {
    http_response_code($code);
    echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function db() {
    static $pdo = null;
    if ($pdo) return $pdo;
    try {
        $pdo = new PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4', DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $pdo->exec('CREATE TABLE IF NOT EXISTS sky_products (
            id VARCHAR(120) NOT NULL,
            name VARCHAR(200) NOT NULL,
            price DECIMAL(12,2) NOT NULL DEFAULT 0,
            price_note VARCHAR(120) NOT NULL DEFAULT "",
            booking DECIMAL(12,2) NOT NULL DEFAULT 0,
            created_at BIGINT NOT NULL DEFAULT 0,
            description MEDIUMTEXT NULL,
            images MEDIUMTEXT NULL,
            videos MEDIUMTEXT NULL,
            specs MEDIUMTEXT NULL,
            PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
        $pdo->exec('CREATE TABLE IF NOT EXISTS sky_meta (k VARCHAR(40) NOT NULL, v VARCHAR(255) NOT NULL, PRIMARY KEY (k)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    } catch (Throwable $e) {
        out(['ok' => false, 'error' => 'Cannot connect to the database. Check config.php (database name, user and password).'], 500);
    }
    return $pdo;
}

/* ---------- small helpers ---------- */
function s($v, $max) {
    $v = (string)($v === null ? '' : $v);
    return function_exists('mb_substr') ? mb_substr($v, 0, $max) : substr($v, 0, $max);
}
function num($v) {
    $n = (float)preg_replace('/[^0-9.]/', '', (string)$v);
    return $n > 0 ? $n : 0;
}
function isUrl($u) {
    $u = trim((string)$u);
    return (bool)preg_match('~^https?://~i', $u) || ($u !== '' && $u[0] === '/' && (strlen($u) < 2 || $u[1] !== '/'));
}
function authed($b) {
    $pin = trim((string)ADMIN_PIN);
    if ($pin === '' || $pin === 'change-me') out(['ok' => false, 'error' => 'Set ADMIN_PIN in config.php first.'], 500);
    if (!hash_equals($pin, trim((string)($b['pin'] ?? '')))) {
        usleep(800000); // slow down password guessing
        out(['ok' => false, 'error' => 'Wrong passcode.'], 401);
    }
}

/* ---------- list ---------- */
function readList() {
    $pdo = db();
    $rows = $pdo->query('SELECT * FROM sky_products ORDER BY created_at DESC, id ASC')->fetchAll();
    if (!$rows) {
        $init = $pdo->query("SELECT v FROM sky_meta WHERE k = 'initialized'")->fetchColumn();
        return $init === '1' ? [] : null;   // null = never saved yet -> the site shows its default product
    }
    $list = [];
    foreach ($rows as $r) {
        $list[] = [
            'id' => $r['id'],
            'name' => $r['name'],
            'price' => (float)$r['price'],
            'priceNote' => $r['price_note'],
            'booking' => (float)$r['booking'],
            'createdAt' => (int)$r['created_at'],
            'description' => (string)$r['description'],
            'images' => json_decode((string)$r['images'], true) ?: [],
            'videos' => json_decode((string)$r['videos'], true) ?: [],
            'specs' => json_decode((string)$r['specs'], true) ?: [],
        ];
    }
    return $list;
}

/* ---------- save (replace the whole list) ---------- */
function cleanList($list) {
    if (!is_array($list) || count($list) > 300) out(['ok' => false, 'error' => 'Invalid product data.'], 400);
    $items = []; $seen = [];
    foreach ($list as $p) {
        if (!is_array($p) || empty($p['id']) || empty($p['name'])) out(['ok' => false, 'error' => 'Invalid product data.'], 400);
        $id = s($p['id'], 110); $base = $id; $n = 2;
        while (isset($seen[$id])) { $id = $base . '-' . $n++; }
        $seen[$id] = true;
        $images = []; foreach ((array)($p['images'] ?? []) as $u) { $u = s($u, 1000); if (isUrl($u)) $images[] = $u; }
        $videos = [];
        foreach ((array)($p['videos'] ?? []) as $v) {
            $u = s(is_array($v) ? ($v['url'] ?? '') : '', 1000);
            $t = s(is_array($v) ? ($v['thumb'] ?? '') : '', 1000);
            if (isUrl($u)) $videos[] = ['url' => $u, 'kind' => 'file', 'thumb' => isUrl($t) ? $t : ''];
        }
        $specs = [];
        foreach ((array)($p['specs'] ?? []) as $x) {
            if (is_array($x) && !empty($x[0]) && !empty($x[1])) $specs[] = [s($x[0], 120), s($x[1], 300)];
        }
        $items[] = [
            'id' => $id, 'name' => s($p['name'], 200), 'price' => num($p['price'] ?? 0),
            'priceNote' => s($p['priceNote'] ?? '', 120), 'booking' => num($p['booking'] ?? 0),
            'createdAt' => (int)($p['createdAt'] ?? 0) ?: (int)(microtime(true) * 1000),
            'description' => s($p['description'] ?? '', 20000),
            'images' => array_slice($images, 0, 20), 'videos' => array_slice($videos, 0, 10), 'specs' => array_slice($specs, 0, 60),
        ];
    }
    return $items;
}

function saveList($list) {
    $items = cleanList($list);
    $pdo = db();
    try {
        $pdo->beginTransaction();
        $pdo->exec('DELETE FROM sky_products');
        $st = $pdo->prepare('INSERT INTO sky_products (id, name, price, price_note, booking, created_at, description, images, videos, specs)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $j = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;
        foreach ($items as $p) {
            $st->execute([$p['id'], $p['name'], $p['price'], $p['priceNote'], $p['booking'], $p['createdAt'], $p['description'],
                json_encode($p['images'], $j), json_encode($p['videos'], $j), json_encode($p['specs'], $j)]);
        }
        $pdo->exec("REPLACE INTO sky_meta (k, v) VALUES ('initialized', '1')");
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        out(['ok' => false, 'error' => 'Could not save to the database.'], 500);
    }
    return ['ok' => true, 'count' => count($items)];
}

/* ---------- photo / video upload (saved in the "uploads" folder next to api.php) ---------- */
function uploadFile($b) {
    $types = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'video/mp4' => 'mp4', 'video/webm' => 'webm'];
    $type = (string)($b['type'] ?? '');
    if (!isset($types[$type])) out(['ok' => false, 'error' => 'Only JPG/PNG/WebP images or MP4/WebM videos.'], 400);
    $isImg = strpos($type, 'image/') === 0;
    $data = base64_decode((string)($b['data'] ?? ''), true);
    if ($data === false || $data === '') out(['ok' => false, 'error' => 'Empty or invalid file.'], 400);
    if (strlen($data) > ($isImg ? 4 : 10) * 1024 * 1024) {
        out(['ok' => false, 'error' => $isImg ? 'Image is too large (max 4 MB).' : 'Video is too large (max 10 MB). Use a YouTube / Google Drive link instead.'], 413);
    }
    if ($isImg) {
        if (@getimagesizefromstring($data) === false) out(['ok' => false, 'error' => 'That file is not a valid image.'], 400);
    } elseif (function_exists('finfo_buffer')) {
        $m = finfo_buffer(finfo_open(FILEINFO_MIME_TYPE), $data);
        if (strpos((string)$m, 'video/') !== 0 && $m !== 'audio/webm' && $m !== 'application/octet-stream') {
            out(['ok' => false, 'error' => 'That file is not a valid video.'], 400);
        }
    }
    $dir = __DIR__ . '/uploads';
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) out(['ok' => false, 'error' => 'Cannot create the uploads folder. Create a folder named "uploads" next to api.php.'], 500);
    if (!file_exists($dir . '/.htaccess')) {
        @file_put_contents($dir . '/.htaccess', "# uploaded files are only ever served, never executed\n<IfModule mod_authz_core.c>\n  <FilesMatch \"\\.(php|phtml|php[0-9]|phar|pl|py|cgi)$\">\n    Require all denied\n  </FilesMatch>\n</IfModule>\n<IfModule !mod_authz_core.c>\n  <FilesMatch \"\\.(php|phtml|php[0-9]|phar|pl|py|cgi)$\">\n    Order allow,deny\n    Deny from all\n  </FilesMatch>\n</IfModule>\n");
    }
    if (!file_exists($dir . '/index.html')) @file_put_contents($dir . '/index.html', '');   // stops folder listing without special server settings
    $name = bin2hex(random_bytes(12)) . '.' . $types[$type];
    if (@file_put_contents($dir . '/' . $name, $data) === false) out(['ok' => false, 'error' => 'Could not save the file (uploads folder not writable).'], 500);
    // saved WITHOUT the domain name (e.g. /uploads/abc.jpg) so photos and videos keep working if you change domain
    $path = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/') . '/uploads/' . $name;
    return ['ok' => true, 'url' => $path];
}

/* ---------- routing ---------- */
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $raw = (string)file_get_contents('php://input');
    if ($raw === '' && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
        // PHP drops requests bigger than post_max_size - tell the admin clearly instead of failing silently
        out(['ok' => false, 'error' => 'The file is bigger than your server allows (post_max_size = ' . ini_get('post_max_size') . '). Use a smaller file, or paste a YouTube / Google Drive link.'], 413);
    }
    $b = json_decode($raw, true);
    if (!is_array($b)) out(['ok' => false, 'error' => 'Invalid request.'], 400);
    authed($b);
    $action = $b['action'] ?? '';
    if ($action === 'check')  out(['ok' => true]);
    if ($action === 'save')   out(saveList($b['list'] ?? null));
    if ($action === 'upload') out(uploadFile($b));
    out(['ok' => false, 'error' => 'Unknown action.'], 400);
}
out(['ok' => true, 'list' => readList()]);
