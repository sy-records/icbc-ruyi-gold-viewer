<?php

declare(strict_types=1);

final class QuoteParser
{
    private const PRICE_SCALE = 100.0;

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    public static function normalizeQuote(array $payload): array
    {
        $tranErrorCode = (string)($payload['TranErrorCode'] ?? '');
        if ($tranErrorCode !== '0') {
            $message = (string)($payload['TranErrorDisplayMsg'] ?? 'ICBC API returned an error');
            throw new RuntimeException($message);
        }

        $item = $payload['pronoinfo'][0] ?? null;
        if (!is_array($item)) {
            throw new RuntimeException('ICBC API returned empty quote data');
        }

        $buyRaw  = self::toNumber($item['buyprice'] ?? null);
        $sellRaw = self::toNumber($item['sellprice'] ?? null);

        if ($buyRaw === null || $sellRaw === null) {
            throw new RuntimeException('ICBC API returned invalid price format');
        }

        return [
            'timestamp'   => gmdate('c'),
            'buyRaw'      => $buyRaw,
            'sellRaw'     => $sellRaw,
            'buy'         => round($buyRaw / self::PRICE_SCALE, 2),
            'sell'        => round($sellRaw / self::PRICE_SCALE, 2),
        ];
    }

    private static function toNumber(mixed $value): ?float
    {
        if (!is_string($value) && !is_int($value) && !is_float($value)) {
            return null;
        }

        if (!is_numeric((string)$value)) {
            return null;
        }

        return (float)$value;
    }
}

