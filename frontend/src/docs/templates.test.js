import { describe, it, expect } from 'vitest';
import { renderDocument, renderFeuille, couleurSure, imageSure, libelleCreneau, creneauxParJour } from './templates.js';

const XSS = '<script>alert(1)</script>';
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

const organisme = {
  nom: `Org ${XSS}`,
  siret: '12345678900011',
  nda: '93060000006',
  qualiopi_numero: 'Q-123',
  adresse: '1 rue du Port',
  code_postal: '06000',
  ville: 'Nice',
  representant_nom: 'Jeanne Martin',
  representant_qualite: 'Gérante',
  referent_handicap_nom: 'Paul Durand',
  referent_handicap_email: 'handicap@exemple.fr',
  mentions_documents: 'SAS au capital de 1 000 €\nRCS Nice',
};

function snapshot(type, extra = {}) {
  return {
    type,
    organisme,
    session: {
      id: 1, reference: 'S-01', intitule: `Hygiène ${XSS}`, type: 'intra', modalite: 'presentiel', lieu: 'Salle A',
      date_debut: '2026-10-05', date_fin: '2026-10-06', duree_heures: '14.00', prix_ht: '1200.00', financement: 'OPCO',
    },
    formation: {
      titre: 'Hygiène alimentaire', code: 'HACCP', objectifs: 'Objectif 1\nObjectif 2', prerequis: 'Aucun', public_vise: 'Cuisiniers',
      duree_heures: '14.00', duree_jours: '2.0', contenu: 'Module 1\nModule 2', methodes_pedagogiques: 'Apports', moyens_techniques: 'Vidéoprojecteur',
      modalites_evaluation: 'QCM', accessibilite: 'Locaux accessibles', version: 2,
    },
    client: { raison_sociale: `Client ${XSS}`, ville: 'Nice' },
    formateur: { prenom: 'Luc', nom: 'Bernard' },
    creneaux: [
      { date: '2026-10-05', heure_debut: '09:00:00', heure_fin: '12:30:00' },
      { date: '2026-10-05', heure_debut: '13:30:00', heure_fin: '17:00:00' },
    ],
    heures_planifiees: 7,
    ...extra,
  };
}

const stagiaire = { civilite: 'Mme', prenom: 'Alice', nom: XSS, entreprise: 'ACME' };

function doc(type, extra = {}) {
  return {
    id: 1, type, numero: 'ATT-2026-0001', code_verif: 'abcdefghjkmnpqrs', created_at: '2026-10-07 10:00:00',
    snapshot: snapshot(type, extra),
    visuels: { logo: PNG, signature_cachet: PNG, couleur: 'red;background:url(x)', conditions_generales: `CGV ${XSS}` },
  };
}

function parse(h) {
  const el = document.createElement('div');
  el.innerHTML = h;
  return el;
}

function sansScript(h) {
  const el = parse(h);
  expect(el.querySelector('script')).toBeNull();
  expect(h).not.toContain('<script>');
  expect(el.textContent).toContain(XSS);
  return el;
}

describe('modèles de documents', () => {
  it('convention : échappement, articles, prix HT, annexe CG', () => {
    const { html } = renderDocument(doc('convention', { stagiaires: [{ civilite: 'M.', prenom: 'Bob', nom: XSS }] }));
    const el = sansScript(html);
    expect(el.textContent).toContain('Convention de formation professionnelle');
    expect(el.textContent).toMatch(/1\s?200,00\s?€ HT/);
    expect(el.textContent).toContain('TVA');
    expect(el.querySelector('.annexe')).not.toBeNull();
    expect(el.querySelector('.doc').getAttribute('style')).toContain('#1f3a68');
    expect(el.textContent).toContain("N° de déclaration d'activité : 93060000006");
  });

  it('convention sans client → contrat avec le bénéficiaire', () => {
    const { html } = renderDocument(doc('convention', { client: null, stagiaires: [{ civilite: 'M.', prenom: 'Bob', nom: 'Leroy' }] }));
    const el = sansScript(html);
    expect(el.textContent).toContain('Convention / contrat de formation');
    expect(el.textContent).toContain('M. Bob Leroy');
  });

  it('convocation : codes et QR', () => {
    const { html } = renderDocument(
      doc('convocation', { stagiaire, acces: { code_session: 'ABC123', code_acces: '654321', token: 'tok' } }),
      { qrPortail: PNG, portailBase: 'https://x/stagiaire.html' },
    );
    const el = sansScript(html);
    expect(el.textContent).toContain('Votre espace stagiaire');
    expect(el.textContent).toContain('ABC123');
    expect(el.textContent).toContain('654321');
    expect(el.textContent).toContain('Paul Durand');
    expect(el.querySelector('.encadre img')).not.toBeNull();
  });

  it('attestation : heures, évaluations, QR de vérification', () => {
    const { html } = renderDocument(
      doc('attestation', {
        stagiaire, heures_realisees: 6.5, dates_presence: ['2026-10-05'],
        evaluations: [{ titre: `QCM ${XSS}`, moment: 'fin', score: '8', score_max: '10' }],
      }),
      { qrVerif: PNG, verifUrl: 'https://x/verification.html#abc' },
    );
    const el = sansScript(html);
    expect(el.textContent).toContain('6,5 heures');
    expect(el.textContent).toContain('80 %');
    expect(el.textContent).toContain("Vérifier l'authenticité : scannez ce code");
  });

  it('certificat de réalisation : cases et engagement de conservation', () => {
    const { html } = renderDocument(doc('certificat_realisation', { stagiaire, heures_realisees: 7 }), { qrVerif: PNG });
    const el = sansScript(html);
    expect(el.textContent).toContain('☒ action de formation');
    expect(el.textContent).toContain('☐ bilan de compétences');
    expect(el.textContent).toContain('pendant une durée de 3 ans');
  });

  it('feuille émise (snapshot) → grille vierge', () => {
    const r = renderDocument(doc('feuille_emargement'));
    const el = sansScript(r.html);
    expect(el.querySelectorAll('table.emargement tbody tr').length).toBe(11);
  });

  it('feuille vivante : signatures, absences, formateur, paysage', () => {
    const data = {
      session: {
        intitule: `Hygiène ${XSS}`, reference: 'S-01', lieu: 'Salle A', date_debut: '2026-10-05', date_fin: '2026-10-05',
        formation: { titre: 'Hygiène' }, formateur: { prenom: 'Luc', nom: 'Bernard' }, client: { raison_sociale: 'ACME' },
        creneaux: [
          { id: 10, date: '2026-10-05', heure_debut: '09:00:00', heure_fin: '12:30:00' },
          { id: 11, date: '2026-10-05', heure_debut: '13:30:00', heure_fin: '17:00:00' },
          { id: 12, date: '2026-10-05', heure_debut: '18:00:00', heure_fin: '20:00:00' },
        ],
        inscriptions: [
          { id: 1, civilite: 'Mme', prenom: 'Alice', nom: XSS, entreprise: 'ACME', statut: 'inscrit' },
          { id: 2, civilite: 'M.', prenom: 'Bob', nom: 'Leroy', entreprise: null, statut: 'inscrit' },
          { id: 3, civilite: 'M.', prenom: 'Zoé', nom: 'Annulée', entreprise: null, statut: 'annule' },
        ],
      },
      signatures: [
        { creneau_id: 10, inscription_id: 1, statut: 'present', signature: PNG, signed_at: '2026-10-05 07:05:00', mode: 'portail' },
        { creneau_id: 10, inscription_id: 2, statut: 'absent', signature: null, signed_at: '2026-10-05 07:05:00', mode: 'tablette' },
        { creneau_id: 11, inscription_id: 2, statut: 'absent_justifie', signature: null, signed_at: '2026-10-05 12:00:00', mode: 'tablette' },
        { creneau_id: 11, inscription_id: 1, statut: 'present', signature: 'javascript:alert(1)', signed_at: '2026-10-05 12:00:00', mode: 'tablette' },
      ],
      formateur_signatures: [{ id: 10, formateur_signature: PNG, formateur_signed_at: '2026-10-05 07:00:00' }],
      organisme: { nom: 'Org', couleur: '#123456' },
    };
    const r = renderFeuille(data);
    expect(r.paysage).toBe(true);
    const el = sansScript(r.html);
    expect(el.querySelectorAll('table.emargement tbody tr').length).toBe(3); // 2 stagiaires + formateur
    expect(el.textContent).toContain('Absent justifié');
    expect(el.textContent).toContain('(portail)');
    expect(el.textContent).toContain('Matin 09h00–12h30');
    expect(el.textContent).not.toContain('Annulée');
    expect(el.querySelectorAll('img.sig-img').length).toBe(2);
    expect(r.html).not.toContain('javascript:');
    expect(el.querySelector('.doc').getAttribute('style')).toContain('#123456');
  });
});

describe('utilitaires', () => {
  it('couleurSure / imageSure', () => {
    expect(couleurSure('#abc')).toBe('#abc');
    expect(couleurSure('red;x:y')).toBe('#1f3a68');
    expect(imageSure('javascript:1')).toBe('');
    expect(imageSure(PNG)).toBe(PNG);
  });
  it('libellés de créneaux', () => {
    const j = creneauxParJour([
      { date: '2026-10-05', heure_debut: '13:30:00', heure_fin: '17:00:00' },
      { date: '2026-10-05', heure_debut: '09:00:00', heure_fin: '12:30:00' },
    ])[0];
    expect(j.creneaux.map((c) => libelleCreneau(c, j.creneaux))).toEqual(['Matin 09h00–12h30', 'Après-midi 13h30–17h00']);
  });
});
