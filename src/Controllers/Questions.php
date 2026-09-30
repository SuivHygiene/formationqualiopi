<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\HttpError;

/** Structure et correction des questionnaires. */
final class Questions
{
    public const TYPES = ['choix_unique', 'choix_multiple', 'echelle', 'oui_non', 'texte'];

    /**
     * Valide et normalise la liste des questions.
     * @param mixed $questions
     * @return list<array<string,mixed>>
     */
    public static function normalize(mixed $questions): array
    {
        if (!is_array($questions) || !array_is_list($questions)) {
            throw HttpError::bad('Liste de questions invalide', ['questions' => 'Liste attendue']);
        }
        if (count($questions) > 200) {
            throw HttpError::bad('200 questions maximum', ['questions' => 'Trop de questions']);
        }
        $out = [];
        $ids = [];
        foreach ($questions as $i => $q) {
            $n = $i + 1;
            if (!is_array($q)) {
                throw HttpError::bad("Question $n invalide");
            }
            $type = (string) ($q['type'] ?? '');
            if (!in_array($type, self::TYPES, true)) {
                throw HttpError::bad("Question $n : type inconnu");
            }
            $libelle = trim((string) ($q['libelle'] ?? ''));
            if ($libelle === '' || mb_strlen($libelle) > 1000) {
                throw HttpError::bad("Question $n : intitulé manquant ou trop long");
            }
            $id = preg_replace('/[^a-z0-9_]/', '', strtolower((string) ($q['id'] ?? ''))) ?: 'q' . $n;
            while (isset($ids[$id])) {
                $id .= '_' . $n;
            }
            $ids[$id] = true;
            $item = ['id' => $id, 'type' => $type, 'libelle' => $libelle, 'obligatoire' => !empty($q['obligatoire'])];
            if (in_array($type, ['choix_unique', 'choix_multiple'], true)) {
                $opts = array_values(array_filter(array_map(static fn ($o) => trim((string) $o), (array) ($q['options'] ?? [])), static fn ($o) => $o !== ''));
                if (count($opts) < 2 || count($opts) > 20) {
                    throw HttpError::bad("Question $n : entre 2 et 20 choix");
                }
                $item['options'] = array_map(static fn ($o) => mb_substr($o, 0, 500), $opts);
                $correct = array_values(array_unique(array_filter(
                    array_map('intval', (array) ($q['correct'] ?? [])),
                    static fn ($c) => $c >= 0 && $c < count($opts),
                )));
                sort($correct);
                if ($type === 'choix_unique' && count($correct) > 1) {
                    $correct = [$correct[0]];
                }
                if ($correct) {
                    $item['correct'] = $correct;
                }
            }
            if (!empty($q['explication'])) {
                $item['explication'] = mb_substr(trim((string) $q['explication']), 0, 2000);
            }
            $out[] = $item;
        }
        return $out;
    }

    /**
     * Vérifie les réponses et calcule le score (questions ayant une bonne réponse définie).
     * @param list<array<string,mixed>> $questions
     * @param mixed $answers
     * @return array{answers:array<string,mixed>, score:?float, score_max:?float}
     */
    public static function grade(array $questions, mixed $answers): array
    {
        if (!is_array($answers)) {
            throw HttpError::bad('Réponses invalides');
        }
        $clean = [];
        $score = 0.0;
        $max = 0.0;
        foreach ($questions as $q) {
            $v = $answers[$q['id']] ?? null;
            $empty = $v === null || $v === '' || $v === [];
            if ($empty) {
                if ($q['obligatoire']) {
                    throw HttpError::bad('Merci de répondre à toutes les questions obligatoires', [$q['id'] => 'Obligatoire']);
                }
                if (isset($q['correct'])) {
                    $max++;
                }
                continue;
            }
            switch ($q['type']) {
                case 'echelle':
                    $v = (int) $v;
                    if ($v < 1 || $v > 5) {
                        throw HttpError::bad('Note hors échelle', [$q['id'] => '1 à 5']);
                    }
                    break;
                case 'oui_non':
                    $v = filter_var($v, FILTER_VALIDATE_BOOLEAN);
                    break;
                case 'texte':
                    $v = mb_substr(trim((string) $v), 0, 5000);
                    break;
                case 'choix_unique':
                    $v = (int) $v;
                    if ($v < 0 || $v >= count($q['options'])) {
                        throw HttpError::bad('Choix invalide', [$q['id'] => 'Invalide']);
                    }
                    break;
                case 'choix_multiple':
                    $v = array_values(array_unique(array_map('intval', (array) $v)));
                    foreach ($v as $c) {
                        if ($c < 0 || $c >= count($q['options'])) {
                            throw HttpError::bad('Choix invalide', [$q['id'] => 'Invalide']);
                        }
                    }
                    sort($v);
                    break;
            }
            $clean[$q['id']] = $v;
            if (isset($q['correct'])) {
                $max++;
                $given = is_array($v) ? $v : [$v];
                if ($given === $q['correct']) {
                    $score++;
                }
            }
        }
        return ['answers' => $clean, 'score' => $max > 0 ? $score : null, 'score_max' => $max > 0 ? $max : null];
    }
}
