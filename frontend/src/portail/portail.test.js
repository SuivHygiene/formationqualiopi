import { describe, it, expect, beforeEach, vi } from 'vitest';

const TOKEN = 'b'.repeat(64);
const today = (() => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();

const MOI = {
  stagiaire: { prenom: 'Léa', nom: 'Martin' },
  organisme: { nom: 'Forma <b>Plus</b>', logo: null, couleur: '#2e7d6b', referent_handicap_nom: 'Paul R.', referent_handicap_email: 'paul@ex.fr', referent_handicap_tel: '01 02 03 04 05' },
  session: { intitule: 'Sécurité incendie', lieu: 'Nice', modalite: 'presentiel', date_debut: today, date_fin: today, formateur: 'Jean Dupont', statut: 'en_cours' },
  creneaux: [
    { id: 1, date: today, heure_debut: '09:00:00', heure_fin: '12:30:00', emargement: 'present', signed_at: today + ' 07:05:00', signable: false },
    { id: 2, date: today, heure_debut: '13:30:00', heure_fin: '17:00:00', emargement: null, signed_at: null, signable: true },
  ],
  questionnaires: [{ id: 7, titre: 'Satisfaction', type: 'satisfaction_chaud', moment: 'fin', submitted_at: null }],
  documents: [{ type: 'convocation', numero: 'CONV-2026-0001', code_verif: 'abcdabcdabcdabcd', created_at: '2026-02-01 10:00:00' }],
};
const Q = {
  id: 7, titre: 'Satisfaction', type: 'satisfaction_chaud', moment: 'fin', ouvert: true, reponse: null,
  questions: [
    { id: 'note', type: 'echelle', libelle: 'Note globale', obligatoire: true },
    { id: 'qcm', type: 'choix_unique', libelle: 'Réponse ?', obligatoire: false, options: ['A', 'B'] },
  ],
};

function res(status, body) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
}
window.scrollTo = () => {};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('portail stagiaire (DOM)', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<div id="app"></div>';
    localStorage.clear();
    history.replaceState(null, '', '/stagiaire.html');
  });

  it('affiche la connexion avec le code session pré-rempli', async () => {
    history.replaceState(null, '', '/stagiaire.html?s=abc123');
    globalThis.fetch = vi.fn();
    await import('./portail.js');
    expect(document.querySelector('#code_session').value).toBe('ABC123');
    expect(document.querySelector('#code_acces').getAttribute('inputmode')).toBe('numeric');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stocke le jeton du lien, affiche l’accueil et répond au questionnaire', async () => {
    history.replaceState(null, '', '/stagiaire.html#t=' + TOKEN);
    const calls = [];
    globalThis.fetch = vi.fn((url, opts) => {
      calls.push([opts.method, url, opts.headers['X-Access-Token'], opts.body]);
      if (url === '/api/portail/moi') return res(200, MOI);
      if (url === '/api/portail/questionnaires/7' && opts.method === 'GET') return res(200, Q);
      if (url === '/api/portail/questionnaires/7') {
        return res(200, { ...Q, reponse: { answers: { note: 5 }, score: 1, score_max: 1, submitted_at: '2026-03-02 15:00:00' } });
      }
      return res(404, { error: 'x' });
    });
    await import('./portail.js');
    await flush();
    expect(localStorage.getItem('sf_portail_token')).toBe(TOKEN);
    expect(location.hash).toBe('');
    expect(calls[0][2]).toBe(TOKEN);
    const text = document.body.textContent;
    expect(text).toContain('Bonjour Léa');
    expect(text).toContain('Forma <b>Plus</b>'); // échappé
    expect(document.querySelector('.pt-now [data-sign="2"]')).not.toBeNull();
    expect(text).toContain('Signé à');
    expect(document.querySelector('a[href="/verification.html#abcdabcdabcdabcd"]')).not.toBeNull();
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#2e7d6b');

    location.hash = '#q=7';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await flush();
    await flush();
    const form = document.querySelector('form.pt-form');
    expect(form.querySelectorAll('.pt-scale-item').length).toBe(5);
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(document.querySelector('[data-q="note"]').classList.contains('pt-q-invalid')).toBe(true);
    expect(calls.filter((c) => c[0] === 'POST').length).toBe(0);

    form.querySelector('input[name="q_note"][value="5"]').checked = true;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    await flush();
    const post = calls.find((c) => c[0] === 'POST');
    expect(JSON.parse(post[3])).toEqual({ answers: { note: 5 } });
    expect(document.body.textContent).toContain('Votre score : 1 / 1');
  });

  it('revient à la connexion si le jeton est refusé', async () => {
    localStorage.setItem('sf_portail_token', TOKEN);
    globalThis.fetch = vi.fn(() => res(401, { error: 'Lien invalide' }));
    await import('./portail.js');
    await flush();
    await flush();
    expect(localStorage.getItem('sf_portail_token')).toBeNull();
    expect(document.querySelector('#code_session')).not.toBeNull();
    expect(document.body.textContent).toContain('n’est plus valide');
  });
});

describe('page de vérification (DOM)', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<div id="app"></div>';
  });

  it('affiche « Document authentique »', async () => {
    history.replaceState(null, '', '/verification.html#abcdabcdabcdabcd');
    globalThis.fetch = vi.fn(() =>
      res(200, { valide: true, type: 'attestation', numero: 'ATT-2026-0001', emis_le: '2026-03-03 10:00:00', organisme: { nom: 'Forma', nda: '93060000006' }, formation: 'Sécurité', dates: { debut: '2026-03-02', fin: '2026-03-03' }, stagiaire: 'Léa M.', heures_realisees: 14 }),
    );
    await import('./verification.js');
    await flush();
    await flush();
    expect(fetch.mock.calls[0][0]).toBe('/api/verification/abcdabcdabcdabcd');
    const t = document.body.textContent;
    expect(t).toContain('Document authentique');
    expect(t).toContain('Attestation de fin de formation');
    expect(t).toContain('Léa M.');
  });

  it('affiche « Document introuvable » sur 404', async () => {
    history.replaceState(null, '', '/verification.html#zzzzzzzzzzzzzzzz');
    globalThis.fetch = vi.fn(() => res(404, { error: 'Document introuvable' }));
    await import('./verification.js');
    await flush();
    await flush();
    expect(document.body.textContent).toContain('Document introuvable');
    expect(document.querySelector('#vf-code').value).toBe('zzzzzzzzzzzzzzzz');
  });
});
