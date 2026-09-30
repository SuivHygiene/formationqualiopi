import { describe, it, expect } from 'vitest';
import {
  tokenFromHash,
  normalizeCodeSession,
  normalizeCodeAcces,
  safeColor,
  onColor,
  periode,
  groupCreneauxParJour,
  statutCreneau,
  creneauASigner,
  buildAnswers,
  readAnswers,
  validateAnswers,
  compactAnswers,
  isEmptyAnswer,
  heureLocale,
  normalizeVerifCode,
  isVerifCode,
  fieldName,
} from './logic.js';

const T = 'a'.repeat(32) + '0123456789abcdef0123456789abcdef';

describe('jeton et codes', () => {
  it('extrait le jeton du hash', () => {
    expect(tokenFromHash('#t=' + T)).toBe(T);
    expect(tokenFromHash('#t=' + T.toUpperCase())).toBe(T);
    expect(tokenFromHash('#x=1&t=' + T)).toBe(T);
    expect(tokenFromHash('#t=abc')).toBeNull();
    expect(tokenFromHash('')).toBeNull();
    expect(tokenFromHash('#q=3')).toBeNull();
  });
  it('normalise les codes saisis', () => {
    expect(normalizeCodeSession(' ab-c 12x9')).toBe('ABC12X');
    expect(normalizeCodeAcces('12 34a567')).toBe('123456');
  });
  it('valide la couleur et choisit un texte lisible', () => {
    expect(safeColor('#1F3A68')).toBe('#1f3a68');
    expect(safeColor('#abc')).toBe('#aabbcc');
    expect(safeColor('red; background:url(x)')).toBeNull();
    expect(onColor('#1f3a68')).toBe('#ffffff');
    expect(onColor('#ffe066')).toBe('#111827');
  });
});

describe('créneaux', () => {
  const creneaux = [
    { id: 3, date: '2026-03-03', heure_debut: '09:00:00', heure_fin: '12:30:00', emargement: null, signable: false },
    { id: 2, date: '2026-03-02', heure_debut: '13:30:00', heure_fin: '17:00:00', emargement: null, signable: true },
    { id: 1, date: '2026-03-02', heure_debut: '09:00:00', heure_fin: '12:30:00', emargement: 'present', signed_at: '2026-03-02 08:05:00', signable: false },
  ];

  it('regroupe par jour dans l’ordre chronologique', () => {
    const g = groupCreneauxParJour(creneaux);
    expect(g.map((x) => x.date)).toEqual(['2026-03-02', '2026-03-03']);
    expect(g[0].creneaux.map((c) => c.id)).toEqual([1, 2]);
    expect(g[1].creneaux.map((c) => c.id)).toEqual([3]);
    expect(groupCreneauxParJour([])).toEqual([]);
    expect(groupCreneauxParJour(undefined)).toEqual([]);
  });

  it('nomme la demi-journée', () => {
    expect(periode('09:00:00')).toBe('Matin');
    expect(periode('13:30')).toBe('Après-midi');
    expect(periode('18:30')).toBe('Soirée');
  });

  it('calcule le statut', () => {
    const today = '2026-03-02';
    expect(statutCreneau(creneaux[2], today).key).toBe('signe');
    expect(statutCreneau(creneaux[1], today).key).toBe('a_signer');
    expect(statutCreneau(creneaux[0], today).label).toBe('Pas encore ouvert');
    expect(statutCreneau({ date: '2026-03-01', emargement: null, signable: false }, today).label).toBe('Non signé');
    expect(statutCreneau({ date: '2026-03-01', emargement: 'absent' }, today).label).toBe('Absent');
    // Créneau du matin passé, consulté l'après-midi du même jour
    expect(statutCreneau({ date: today, emargement: null, signable: false, fenetre: 'passee' }, today).label).toBe('Non signé');
    expect(statutCreneau({ date: today, emargement: null, signable: false, fenetre: 'avant' }, today).label).toBe('Pas encore ouvert');
    expect(statutCreneau({ date: '2026-03-01', emargement: 'absent_justifie' }, today).key).toBe('absent');
  });

  it('trouve le créneau à signer', () => {
    expect(creneauASigner(creneaux).id).toBe(2);
    expect(creneauASigner([creneaux[0]])).toBeNull();
  });

  it('formate l’heure de signature (UTC → local)', () => {
    const h = heureLocale('2026-03-02 08:05:00');
    expect(h).toMatch(/^\d\dh\d\d$/);
    const d = new Date(Date.UTC(2026, 2, 2, 8, 5));
    expect(h).toBe(`${String(d.getHours()).padStart(2, '0')}h05`);
    expect(heureLocale(null)).toBe('');
  });
});

const questions = [
  { id: 'q1', type: 'echelle', libelle: 'Note', obligatoire: true },
  { id: 'q2', type: 'oui_non', libelle: 'Recommander ?', obligatoire: true },
  { id: 'q3', type: 'choix_unique', libelle: 'Choix', obligatoire: false, options: ['A', 'B', 'C'] },
  { id: 'q4', type: 'choix_multiple', libelle: 'Multi', obligatoire: true, options: ['A', 'B', 'C'] },
  { id: 'q5', type: 'texte', libelle: 'Commentaire', obligatoire: false },
];

describe('réponses au questionnaire', () => {
  it('convertit les valeurs brutes en types attendus par l’API', () => {
    const a = buildAnswers(questions, { q1: '4', q2: 'non', q3: '2', q4: ['2', '0', '2'], q5: '  Bien  ' });
    expect(a).toEqual({ q1: 4, q2: false, q3: 2, q4: [0, 2], q5: 'Bien' });
    const b = buildAnswers(questions, { q1: null, q2: null, q3: null, q4: [], q5: '' });
    expect(b).toEqual({ q1: null, q2: null, q3: null, q4: [], q5: '' });
    expect(buildAnswers(questions, { q2: 'oui' }).q2).toBe(true);
  });

  it('lit un formulaire', () => {
    const form = document.createElement('form');
    form.innerHTML = `
      ${[1, 2, 3, 4, 5].map((v) => `<input type="radio" name="${fieldName('q1')}" value="${v}" ${v === 5 ? 'checked' : ''}>`).join('')}
      <input type="radio" name="q_q2" value="oui" checked><input type="radio" name="q_q2" value="non">
      <input type="radio" name="q_q3" value="0"><input type="radio" name="q_q3" value="1">
      <input type="checkbox" name="q_q4" value="0" checked><input type="checkbox" name="q_q4" value="1"><input type="checkbox" name="q_q4" value="2" checked>
      <textarea name="q_q5">Super</textarea>`;
    expect(readAnswers(form, questions)).toEqual({ q1: 5, q2: true, q3: null, q4: [0, 2], q5: 'Super' });
  });

  it('valide les obligatoires', () => {
    const empty = buildAnswers(questions, {});
    expect(validateAnswers(questions, empty)).toEqual({ q1: 'Obligatoire', q2: 'Obligatoire', q4: 'Obligatoire' });
    const ok = { q1: 3, q2: false, q3: null, q4: [1], q5: '' };
    expect(validateAnswers(questions, ok)).toEqual({});
    expect(validateAnswers(questions, { ...ok, q1: 9 })).toEqual({ q1: 'Note de 1 à 5' });
    // false est une réponse valide pour oui/non
    expect(isEmptyAnswer(false)).toBe(false);
    expect(isEmptyAnswer(0)).toBe(false);
    expect(isEmptyAnswer('  ')).toBe(true);
  });

  it('retire les réponses vides avant envoi', () => {
    expect(compactAnswers({ q1: 3, q2: false, q3: null, q4: [], q5: '', q6: 0 })).toEqual({ q1: 3, q2: false, q6: 0 });
  });
});

describe('code de vérification', () => {
  it('normalise et valide', () => {
    expect(normalizeVerifCode('#AB12cd34EF56gh78')).toBe('ab12cd34ef56gh78');
    expect(isVerifCode('ab12cd34ef56gh78')).toBe(true);
    expect(isVerifCode('ab12')).toBe(false);
    expect(normalizeVerifCode('  ab12-cd34 ')).toBe('ab12cd34');
  });
});
