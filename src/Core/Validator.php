<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Nettoyage/validation des entrées selon un mini-DSL :
 *   'str:190|req'  'text'  'int'  'dec'  'date'  'time'  'bool'  'email'
 *   'enum:a,b,c'   'dataurl:500000'  'fk:clients'  'json'
 * Seuls les champs déclarés sont conservés (liste blanche).
 */
final class Validator
{
    /**
     * @param array<string,mixed>  $input
     * @param array<string,string> $spec
     * @param bool $partial true = mise à jour : champs absents ignorés
     * @return array<string,mixed>
     */
    public static function clean(array $input, array $spec, bool $partial = false, ?Db $db = null, ?int $orgId = null): array
    {
        $out = [];
        $errors = [];
        foreach ($spec as $field => $rule) {
            $parts = explode('|', $rule);
            [$type, $arg] = array_pad(explode(':', $parts[0], 2), 2, null);
            $required = in_array('req', $parts, true);
            if (!array_key_exists($field, $input)) {
                if ($required && !$partial) {
                    $errors[$field] = 'Champ obligatoire';
                }
                continue;
            }
            $v = $input[$field];
            if ($v === '' || $v === null) {
                if ($required) {
                    $errors[$field] = 'Champ obligatoire';
                    continue;
                }
                $out[$field] = $type === 'bool' ? 0 : ($type === 'str' && in_array('notnull', $parts, true) ? '' : null);
                continue;
            }
            try {
                $out[$field] = self::cast($type, $arg, $v, $db, $orgId);
            } catch (\InvalidArgumentException $e) {
                $errors[$field] = $e->getMessage();
            }
        }
        if ($errors) {
            throw HttpError::bad('Données invalides', $errors);
        }
        return $out;
    }

    private static function cast(string $type, ?string $arg, mixed $v, ?Db $db, ?int $orgId): mixed
    {
        switch ($type) {
            case 'str':
            case 'text':
                if (!is_scalar($v)) {
                    throw new \InvalidArgumentException('Texte attendu');
                }
                $s = trim((string) $v);
                $max = $arg !== null ? (int) $arg : 65000;
                if (mb_strlen($s) > $max) {
                    throw new \InvalidArgumentException("$max caractères maximum");
                }
                return $s;
            case 'email':
                $s = trim((string) $v);
                if (!filter_var($s, FILTER_VALIDATE_EMAIL) || strlen($s) > 190) {
                    throw new \InvalidArgumentException('E-mail invalide');
                }
                return strtolower($s);
            case 'int':
                if (filter_var($v, FILTER_VALIDATE_INT) === false) {
                    throw new \InvalidArgumentException('Nombre entier attendu');
                }
                return (int) $v;
            case 'dec':
                $s = str_replace([',', ' '], ['.', ''], (string) $v);
                if (!is_numeric($s)) {
                    throw new \InvalidArgumentException('Nombre attendu');
                }
                return round((float) $s, 2);
            case 'bool':
                return filter_var($v, FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
            case 'date':
                $s = (string) $v;
                $d = \DateTimeImmutable::createFromFormat('!Y-m-d', $s);
                if (!$d || $d->format('Y-m-d') !== $s) {
                    throw new \InvalidArgumentException('Date invalide (AAAA-MM-JJ)');
                }
                return $s;
            case 'time':
                $s = (string) $v;
                if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/', $s)) {
                    throw new \InvalidArgumentException('Heure invalide (HH:MM)');
                }
                return strlen($s) === 5 ? "$s:00" : $s;
            case 'enum':
                $allowed = explode(',', (string) $arg);
                if (!in_array((string) $v, $allowed, true)) {
                    throw new \InvalidArgumentException('Valeur non autorisée');
                }
                return (string) $v;
            case 'dataurl':
                $s = (string) $v;
                $max = $arg !== null ? (int) $arg : 500000;
                if (!preg_match('#^data:image/(png|jpeg|svg\+xml|webp);base64,[A-Za-z0-9+/=]+$#', $s)) {
                    throw new \InvalidArgumentException('Image invalide');
                }
                if (strlen($s) > $max) {
                    throw new \InvalidArgumentException('Image trop lourde');
                }
                return $s;
            case 'json':
                if (!is_array($v)) {
                    throw new \InvalidArgumentException('Structure attendue');
                }
                return json_encode($v, JSON_UNESCAPED_UNICODE);
            case 'fk':
                if (filter_var($v, FILTER_VALIDATE_INT) === false || $db === null || $orgId === null) {
                    throw new \InvalidArgumentException('Référence invalide');
                }
                $table = preg_replace('/[^a-z_]/', '', (string) $arg);
                $ok = $db->value("SELECT id FROM `$table` WHERE id = ? AND organisme_id = ?", [(int) $v, $orgId]);
                if ($ok === null) {
                    throw new \InvalidArgumentException('Référence introuvable');
                }
                return (int) $v;
        }
        throw new \LogicException("Type de règle inconnu : $type");
    }
}
