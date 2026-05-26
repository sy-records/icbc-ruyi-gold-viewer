<?php

declare(strict_types=1);

final class FeishuBotNotifier
{
    private const DEFAULT_THRESHOLD = 999.0;
    private const DEFAULT_STATE_FILE = __DIR__ . '/.feishu-buy-alert-state.json';

    public static function getenv($varName)
    {
        if (php_sapi_name() === 'cli') {
            return self::getenv($varName);
        }

        switch ($varName) {
            case 'FEISHU_BOT_WEBHOOK':
                return 'https://open.feishu.cn/open-apis/bot/v2/hook/88a0925c-ce21-4a05-b547-f483fcf1d5c1';
            case 'BUY_ALERT_THRESHOLD':
                return '999';
            default:
                return '';
        }
    }

    /**
     * @param array<string, mixed> $quote
     */
    public static function maybeNotifyLowBuy(array $quote): void
    {
        $webhook = trim(self::getenv('FEISHU_BOT_WEBHOOK') ?: '');
        if ($webhook === '') {
            return;
        }

        $buy = isset($quote['buy']) && is_numeric((string)$quote['buy'])
            ? (float)$quote['buy']
            : null;
        if ($buy === null) {
            return;
        }

        $threshold = self::threshold();
        $stateFile = self::stateFile();

        $dir = dirname($stateFile);
        if (!is_dir($dir) && !@mkdir($dir, 0777, true) && !is_dir($dir)) {
            error_log('[FeishuBotNotifier] Failed to create state directory: ' . $dir);
            return;
        }

        $handle = @fopen($stateFile, 'c+');
        if ($handle === false) {
            error_log('[FeishuBotNotifier] Failed to open state file: ' . $stateFile);
            return;
        }

        try {
            if (!flock($handle, LOCK_EX)) {
                error_log('[FeishuBotNotifier] Failed to acquire state lock');
                return;
            }

            $state = self::readState($handle);
            $isBelow = $buy < $threshold;

            if (!$isBelow) {
                if (($state['isBelow'] ?? false) !== false) {
                    self::writeState($handle, [
                        'isBelow' => false,
                        'updatedAt' => gmdate('c'),
                    ]);
                }
                return;
            }

            if (($state['isBelow'] ?? false) === true) {
                return;
            }

            $secret = trim((string)(self::getenv('FEISHU_BOT_SECRET') ?: ''));
            $message = self::buildMessage($quote, $threshold);
            self::sendWebhook($webhook, $message, $secret);

            self::writeState($handle, [
                'isBelow' => true,
                'threshold' => $threshold,
                'lastBuy' => $buy,
                'lastAlertAt' => gmdate('c'),
                'productCode' => (string)($quote['productCode'] ?? ''),
            ]);
        } catch (Throwable $e) {
            error_log('[FeishuBotNotifier] ' . $e->getMessage());
        } finally {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }

    private static function threshold(): float
    {
        $raw = self::getenv('BUY_ALERT_THRESHOLD');
        if ($raw === false || $raw === '') {
            return self::DEFAULT_THRESHOLD;
        }

        return is_numeric($raw) ? (float)$raw : self::DEFAULT_THRESHOLD;
    }

    private static function stateFile(): string
    {
        $raw = self::getenv('BUY_ALERT_STATE_FILE');
        if ($raw === false || trim($raw) === '') {
            return self::DEFAULT_STATE_FILE;
        }

        return trim($raw);
    }

    /**
     * @return array<string, mixed>
     */
    private static function readState($handle): array
    {
        rewind($handle);
        $raw = stream_get_contents($handle);
        if ($raw === false || trim($raw) === '') {
            return [];
        }

        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }

    /**
     * @param array<string, mixed> $state
     */
    private static function writeState($handle, array $state): void
    {
        rewind($handle);
        ftruncate($handle, 0);
        fwrite($handle, json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        fflush($handle);
    }

    /**
     * @param array<string, mixed> $quote
     */
    private static function buildMessage(array $quote, float $threshold): string
    {
        $buy = number_format((float)$quote['buy'], 2, '.', '');
        $sell = isset($quote['sell']) && is_numeric((string)$quote['sell'])
            ? number_format((float)$quote['sell'], 2, '.', '')
            : '-';
        $timestamp = (string)($quote['timestamp'] ?? gmdate('c'));
        $productCode = (string)($quote['productCode'] ?? 'unknown');

        return implode("\n", [
            '【如意积存金提醒】',
            sprintf('买入价已低于 %.2f', $threshold),
            sprintf('当前买入价：%s', $buy),
            sprintf('当前卖出价：%s', $sell),
            sprintf('产品代码：%s', $productCode),
            sprintf('时间：%s', $timestamp),
        ]);
    }

    private static function sendWebhook(string $webhook, string $message, string $secret = ''): void
    {
        $payload = [
            'msg_type' => 'text',
            'content' => [
                'text' => $message,
            ],
        ];

        if ($secret !== '') {
            $timestamp = (string)time();
            $sign = base64_encode(hash_hmac('sha256', $timestamp . "\n" . $secret, $secret, true));
            $payload['timestamp'] = $timestamp;
            $payload['sign'] = $sign;
        }

        $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw new RuntimeException('Failed to encode Feishu webhook payload');
        }

        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => implode("\r\n", [
                    'Content-Type: application/json; charset=utf-8',
                    'Content-Length: ' . strlen($json),
                ]),
                'content' => $json,
                'timeout' => 5,
                'ignore_errors' => true,
            ],
        ]);

        $response = @file_get_contents($webhook, false, $context);
        if ($response === false) {
            $error = error_get_last();
            throw new RuntimeException('Failed to send Feishu webhook' . ($error ? ': ' . $error['message'] : ''));
        }
    }
}

