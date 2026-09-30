<?php
declare(strict_types=1);

namespace Tests;

use App\Controllers\Questions;
use App\Core\HttpError;
use PHPUnit\Framework\TestCase;

final class QuestionsTest extends TestCase
{
    private function qcm(): array
    {
        return Questions::normalize([
            ['id' => 'q1', 'type' => 'choix_unique', 'libelle' => 'Capitale ?', 'options' => ['Paris', 'Lyon'], 'correct' => [0], 'obligatoire' => true],
            ['id' => 'q2', 'type' => 'choix_multiple', 'libelle' => 'Pairs ?', 'options' => ['1', '2', '4'], 'correct' => [2, 1]],
            ['id' => 'q3', 'type' => 'echelle', 'libelle' => 'Note'],
            ['type' => 'texte', 'libelle' => 'Commentaire'],
        ]);
    }

    public function testNormalisation(): void
    {
        $q = $this->qcm();
        $this->assertSame([1, 2], $q[1]['correct']);
        $this->assertSame('q4', $q[3]['id']);
        $this->assertFalse($q[2]['obligatoire']);
    }

    public function testNotation(): void
    {
        $g = Questions::grade($this->qcm(), ['q1' => 0, 'q2' => [2, 1], 'q3' => 4]);
        $this->assertSame(2.0, $g['score']);
        $this->assertSame(2.0, $g['score_max']);
        $g = Questions::grade($this->qcm(), ['q1' => 1, 'q2' => [1]]);
        $this->assertSame(0.0, $g['score']);
    }

    public function testObligatoire(): void
    {
        $this->expectException(HttpError::class);
        Questions::grade($this->qcm(), ['q2' => [1]]);
    }

    public function testEchelleHorsBornes(): void
    {
        $this->expectException(HttpError::class);
        Questions::grade($this->qcm(), ['q1' => 0, 'q3' => 9]);
    }

    public function testTypeInconnu(): void
    {
        $this->expectException(HttpError::class);
        Questions::normalize([['type' => 'fichier', 'libelle' => 'x']]);
    }
}
