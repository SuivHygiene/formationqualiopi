import { describe, it, expect } from 'vitest';
import { groupByDay, periodeLabel, generateCreneaux } from './planning.js';

describe('planning', () => {
  it('génère matin + après-midi en sautant le week-end', () => {
    // 2026-03-06 = vendredi, 2026-03-09 = lundi
    const r = generateCreneaux('2026-03-06', '2026-03-09', { matin: ['09:00', '12:30'], apresMidi: ['13:30', '17:00'] });
    expect(r.map((c) => c.date)).toEqual(['2026-03-06', '2026-03-06', '2026-03-09', '2026-03-09']);
  });
  it('inclut le week-end si demandé et ignore un créneau incohérent', () => {
    const r = generateCreneaux('2026-03-07', '2026-03-07', { matin: ['09:00', '12:00'], apresMidi: ['17:00', '13:00'], weekends: true });
    expect(r).toEqual([{ date: '2026-03-07', heure_debut: '09:00', heure_fin: '12:00' }]);
  });
  it('renvoie vide si fin avant début', () => {
    expect(generateCreneaux('2026-03-09', '2026-03-01', { matin: ['09:00', '12:00'] })).toEqual([]);
  });
  it('regroupe et trie par jour', () => {
    const g = groupByDay([
      { date: '2026-03-03', heure_debut: '09:00:00' },
      { date: '2026-03-02', heure_debut: '13:30:00' },
      { date: '2026-03-02', heure_debut: '09:00:00' },
    ]);
    expect(g.map((d) => d.date)).toEqual(['2026-03-02', '2026-03-03']);
    expect(g[0].creneaux.map((c) => c.heure_debut)).toEqual(['09:00:00', '13:30:00']);
  });
  it('libellé de période', () => {
    expect(periodeLabel({ heure_debut: '08:30:00' })).toBe('Matin');
    expect(periodeLabel({ heure_debut: '14:00:00' })).toBe('Après-midi');
    expect(periodeLabel({ heure_debut: '19:00:00' })).toBe('Soir');
  });
});
