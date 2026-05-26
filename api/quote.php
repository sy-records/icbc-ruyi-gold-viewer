<?php

declare(strict_types=1);

require_once __DIR__ . '/FeishuBotNotifier.php';
require_once __DIR__ . '/QuoteParser.php';

header('Content-Type: application/json; charset=utf-8');

try {
    $payload = fetchIcbcPayload();
    $quote = QuoteParser::normalizeQuote($payload);
    FeishuBotNotifier::maybeNotifyLowBuy($quote);

    echo json_encode([
        'source' => 'ICBC A00505',
        'quote' => $quote,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'error' => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

/**
 * @return array<string, mixed>
 */
function fetchIcbcPayload(): array
{
    $opensslConf = getenv('ICBC_OPENSSL_CONF');
    if ($opensslConf === false || trim($opensslConf) === '') {
        $opensslConf = __DIR__ . '/openssl.conf';
    }

    $cmd = sprintf(
        'OPENSSL_CONF=%s curl -sS -X POST %s -H %s --data-urlencode %s',
        escapeshellarg($opensslConf),
        escapeshellarg('https://icbcphp.icbc.com.cn/servlet/AsynGetDataServlet'),
        escapeshellarg('Content-Type: application/x-www-form-urlencoded; charset=utf-8'),
        escapeshellarg('tranCode=A00505')
    );

    $output = [];
    $exitCode = 0;
    exec($cmd, $output, $exitCode);

    if ($exitCode !== 0) {
        throw new RuntimeException('Upstream request failed with exit code ' . $exitCode);
    }

    $response = implode("\n", $output);
    if ($response === '') {
        throw new RuntimeException('Upstream request returned empty response');
    }

    $payload = json_decode($response, true);
    if (!is_array($payload)) {
        throw new RuntimeException('Failed to parse upstream JSON payload');
    }

    return $payload;
}

