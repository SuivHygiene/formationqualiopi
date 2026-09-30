<?php
declare(strict_types=1);

namespace Tests;

use App\Core\HttpError;
use App\Core\Validator;
use PHPUnit\Framework\TestCase;

final class ValidatorTest extends TestCase
{
    public function testChampsVidesDesFormulaires(): void
    {
        $out = Validator::clean(
            ['a' => '', 'b' => '', 'c' => '', 'd' => '', 'e' => null, 'f' => ''],
            ['a' => 'enum:x,y', 'b' => 'enum:,M.,Mme', 'c' => 'int|def', 'd' => 'str:10|notnull', 'e' => 'text', 'f' => 'bool'],
        );
        $this->assertSame(['b' => '', 'd' => '', 'e' => null, 'f' => 0], $out);
    }

    public function testListeBlanche(): void
    {
        $out = Validator::clean(['nom' => 'A', 'organisme_id' => 99, 'id' => 5], ['nom' => 'str:10']);
        $this->assertSame(['nom' => 'A'], $out);
    }

    public function testConversions(): void
    {
        $out = Validator::clean(
            ['p' => '12,5', 't' => '09:30', 'd' => '2026-02-28', 'm' => ' A@B.FR '],
            ['p' => 'dec', 't' => 'time', 'd' => 'date', 'm' => 'email'],
        );
        $this->assertSame(['p' => 12.5, 't' => '09:30:00', 'd' => '2026-02-28', 'm' => 'a@b.fr'], $out);
    }

    public function testDateImpossible(): void
    {
        $this->expectException(HttpError::class);
        Validator::clean(['d' => '2026-02-30'], ['d' => 'date']);
    }

    public function testImageNonImage(): void
    {
        $this->expectException(HttpError::class);
        Validator::clean(['i' => 'data:text/html;base64,PHNjcmlwdD4='], ['i' => 'dataurl']);
    }
}
