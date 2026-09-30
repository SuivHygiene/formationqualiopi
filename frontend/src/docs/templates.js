// Modèles des documents officiels : fonctions pures (données → chaîne HTML).
// Toutes les valeurs passent par html`` (échappement automatique) ; raw() n'est
// utilisé que pour du HTML déjà produit par ces mêmes fonctions.
import { html, raw, fmtDate, fmtDateLong, fmtHeure, fmtNum, fmtEuro } from '../ui.js';
import { MODALITE, TYPE_DOCUMENT, MOMENT } from '../labels.js';

export const COULEUR_DEFAUT = '#1f3a68';

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */

/** Couleur d'accent sûre (évite toute injection CSS dans l'attribut style). */
export function couleurSure(c) {
  return typeof c === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c.trim()) ? c.trim() : COULEUR_DEFAUT;
}

/** N'accepte que les images data: (logo, signature) ou http(s). */
export function imageSure(src) {
  if (typeof src !== 'string') return '';
  const s = src.trim();
  return /^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(s) || /^https?:\/\//i.test(s) ? s : '';
}

const vide = (v) => v === null || v === undefined || String(v).trim() === '';

/** Texte long : conserve les retours à la ligne. */
const texte = (v, fallback = '') =>
  vide(v) ? (fallback ? html`<p class="muted">${fallback}</p>` : '') : html`<div class="pre">${String(v).trim()}</div>`;

const heures = (h) => (vide(h) ? '' : `${fmtNum(h, 2)} h`);

const personne = (p) => (p ? [p.civilite, p.prenom, p.nom].filter((x) => !vide(x)).join(' ') : '');

const formateurNom = (f) => (f ? [f.prenom, f.nom].filter((x) => !vide(x)).join(' ') : '');

/** Heure locale « HHhMM » d'un horodatage UTC « YYYY-MM-DD HH:MM:SS ». */
export function heureLocale(utc) {
  if (!utc) return '';
  const d = new Date(String(utc).replace(' ', 'T') + (String(utc).includes('Z') ? '' : 'Z'));
  if (isNaN(d)) return '';
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
}

/** Période « du … au … » ou « le … ». */
function periode(debut, fin) {
  if (!debut && !fin) return '';
  if (!fin || debut === fin) return `le ${fmtDate(debut || fin)}`;
  if (!debut) return `jusqu'au ${fmtDate(fin)}`;
  return `du ${fmtDate(debut)} au ${fmtDate(fin)}`;
}

/** Regroupe les créneaux par date (ordre chronologique). */
export function creneauxParJour(creneaux = []) {
  const tri = [...creneaux].sort((a, b) => `${a.date} ${a.heure_debut}`.localeCompare(`${b.date} ${b.heure_debut}`));
  const jours = new Map();
  for (const c of tri) {
    if (!jours.has(c.date)) jours.set(c.date, []);
    jours.get(c.date).push(c);
  }
  return [...jours.entries()].map(([date, liste]) => ({ date, creneaux: liste }));
}

/** Libellé d'un créneau : « Matin 09h00–12h30 ». */
export function libelleCreneau(c, jour = []) {
  const h = `${fmtHeure(c.heure_debut)}–${fmtHeure(c.heure_fin)}`;
  const debut = String(c.heure_debut || '');
  const moment = debut < '12:00' ? 'Matin' : debut < '18:00' ? 'Après-midi' : 'Soir';
  // Plusieurs créneaux dans la même demi-journée : on n'affiche que l'horaire.
  const memes = jour.filter((x) => {
    const d = String(x.heure_debut || '');
    return (d < '12:00' ? 'Matin' : d < '18:00' ? 'Après-midi' : 'Soir') === moment;
  });
  return memes.length > 1 ? h : `${moment} ${h}`;
}

function listeCreneaux(creneaux) {
  const jours = creneauxParJour(creneaux);
  if (!jours.length) return '';
  return html`<ul class="creneaux">${jours.map(
    (j) =>
      raw(
        html`<li><strong>${fmtDateLong(j.date)}</strong> : ${j.creneaux
          .map((c) => `${fmtHeure(c.heure_debut)} – ${fmtHeure(c.heure_fin)}`)
          .join(' et ')}</li>`,
      ),
  )}</ul>`;
}

/* ------------------------------------------------------------------ */
/* En-tête, pied, blocs communs                                        */
/* ------------------------------------------------------------------ */

function adresseOrg(o) {
  return [o.adresse, [o.code_postal, o.ville].filter((x) => !vide(x)).join(' ')].filter((x) => !vide(x)).join(', ');
}

export function enTete(org = {}, logo = '', titre = '', sousTitre = '') {
  const src = imageSure(logo);
  const contact = [org.telephone ? `Tél. ${org.telephone}` : '', org.email, org.site_web].filter((x) => !vide(x)).join(' · ');
  return html`<header class="doc-head">
    <div class="org">
      ${src ? raw(html`<img class="logo" src="${src}" alt="">`) : ''}
      <div class="org-id">
        <div class="org-nom">${org.nom || ''}</div>
        ${adresseOrg(org) ? raw(html`<div>${adresseOrg(org)}</div>`) : ''}
        ${contact ? raw(html`<div>${contact}</div>`) : ''}
        ${org.siret ? raw(html`<div>SIRET : ${org.siret}</div>`) : ''}
        ${org.nda ? raw(html`<div>N° de déclaration d'activité : ${org.nda}</div>`) : ''}
        ${org.qualiopi_numero
          ? raw(html`<div>Certification Qualiopi n° ${org.qualiopi_numero}${org.qualiopi_certificateur ? ` (${org.qualiopi_certificateur})` : ''}</div>`)
          : ''}
      </div>
    </div>
  </header>
  ${titre ? raw(html`<h1 class="doc-titre">${titre}</h1>`) : ''}
  ${sousTitre ? raw(html`<p class="doc-sous-titre">${sousTitre}</p>`) : ''}`;
}

function pied(doc, org = {}) {
  return html`<footer class="doc-foot">
    <div class="foot-ligne">
      <span>${doc.numero ? `N° ${doc.numero}` : ''}</span>
      <span>${doc.created_at ? `Document émis le ${fmtDate(doc.created_at)}` : ''}</span>
    </div>
    ${org.mentions_documents ? raw(html`<div class="pre mentions">${String(org.mentions_documents).trim()}</div>`) : ''}
  </footer>`;
}

function blocQrVerif(ctx) {
  if (!ctx?.qrVerif) return '';
  return html`<div class="qr-verif">
    <img src="${ctx.qrVerif}" alt="QR code de vérification">
    <div><strong>Vérifier l'authenticité : scannez ce code</strong>${ctx.verifUrl ? raw(html`<div class="small mono">${ctx.verifUrl}</div>`) : ''}</div>
  </div>`;
}

function signatureOrganisme(org, cachet, { avecDate = null, titre = "Pour l'organisme de formation" } = {}) {
  const src = imageSure(cachet);
  return html`<div class="sig-bloc">
    <div class="sig-titre">${titre}</div>
    ${avecDate ? raw(html`<div>${avecDate}</div>`) : ''}
    <div>${org.representant_nom || ''}${org.representant_qualite ? `, ${org.representant_qualite}` : ''}</div>
    <div class="sig-zone">${src ? raw(html`<img src="${src}" alt="Signature et cachet">`) : ''}</div>
  </div>`;
}

const faitA = (org, date) => `Fait à ${org.ville || '…………………'}, le ${fmtDate(date) || '…………………'}`;

function page(doc, visuels, contenu, classe = '') {
  const couleur = couleurSure(visuels?.couleur);
  return html`<article class="doc ${classe}" style="--accent: ${couleur}">${raw(contenu)}</article>`;
}

/* ------------------------------------------------------------------ */
/* 1. Convention                                                       */
/* ------------------------------------------------------------------ */

export function renderConvention(doc, ctx = {}) {
  const s = doc.snapshot || {};
  const org = s.organisme || {};
  const v = doc.visuels || {};
  const se = s.session || {};
  const f = s.formation || {};
  const cl = s.client || null;
  const stagiaires = s.stagiaires || [];
  const titre = cl ? 'Convention de formation professionnelle' : 'Convention / contrat de formation professionnelle';
  const duree = se.duree_heures ?? s.heures_planifiees ?? f.duree_heures;
  let n = 0;
  const art = (t) => html`<h2>Article ${++n} – ${t}</h2>`;

  const parties = html`<section class="parties">
    <p><strong>Entre les soussignés :</strong></p>
    <p><strong>${org.nom || ''}</strong>${adresseOrg(org) ? `, ${adresseOrg(org)}` : ''}${org.siret ? `, SIRET ${org.siret}` : ''}${org.nda ? `, déclaration d'activité n° ${org.nda}` : ''},
      représenté par ${org.representant_nom || '…………………'}${org.representant_qualite ? `, ${org.representant_qualite}` : ''},
      ci-après dénommé « l'organisme de formation »,</p>
    <p>et</p>
    ${cl
      ? raw(html`<p><strong>${cl.raison_sociale || ''}</strong>${[cl.adresse, [cl.code_postal, cl.ville].filter((x) => !vide(x)).join(' ')].filter((x) => !vide(x)).length ? `, ${[cl.adresse, [cl.code_postal, cl.ville].filter((x) => !vide(x)).join(' ')].filter((x) => !vide(x)).join(', ')}` : ''}${cl.siret ? `, SIRET ${cl.siret}` : ''}${cl.contact_nom ? `, représentée par ${cl.contact_nom}${cl.contact_fonction ? `, ${cl.contact_fonction}` : ''}` : ''},
          ci-après dénommée « le client »,</p>`)
      : raw(html`<p>${stagiaires.length ? stagiaires.map(personne).join(', ') : '…………………'}, ci-après dénommé(e)(s) « le bénéficiaire »,</p>`)}
    <p>est conclue la présente convention, en application des articles L. 6353-1 et suivants du Code du travail.</p>
  </section>`;

  const listeStag = stagiaires.length
    ? html`<table class="grille"><thead><tr><th>#</th><th>Stagiaire</th></tr></thead><tbody>${stagiaires.map((st, i) =>
        raw(html`<tr><td class="num">${i + 1}</td><td>${personne(st)}</td></tr>`),
      )}</tbody></table>`
    : html`<p class="muted">Liste des stagiaires communiquée ultérieurement.</p>`;

  const corps = html`
    ${raw(enTete(org, v.logo, titre, se.reference ? `Réf. session : ${se.reference}` : ''))}
    ${raw(parties)}

    ${raw(art('Objet'))}
    <p>La présente convention a pour objet la réalisation, par l'organisme de formation, de l'action de formation intitulée :
      <strong>« ${se.intitule || f.titre || ''} »</strong>${f.code ? ` (code ${f.code}${f.version ? `, version ${f.version}` : ''})` : ''}.</p>
    <h3>Objectifs</h3>
    ${raw(texte(f.objectifs, 'Non renseignés.'))}
    <h3>Programme</h3>
    ${raw(texte(f.contenu, 'Programme annexé.'))}

    ${raw(art('Nature et caractéristiques de l’action'))}
    <p>L'action entre dans la catégorie des actions de formation prévues à l'article L. 6313-1 du Code du travail.</p>
    <table class="kv">
      <tr><th>Durée</th><td>${heures(duree)}${f.duree_jours ? ` (${fmtNum(f.duree_jours, 1)} jour(s))` : ''}</td></tr>
      <tr><th>Modalité</th><td>${MODALITE[se.modalite] || se.modalite || ''}</td></tr>
      <tr><th>Dates</th><td>${periode(se.date_debut, se.date_fin)}</td></tr>
      <tr><th>Lieu</th><td>${se.lieu || ''}</td></tr>
      ${s.formateur ? raw(html`<tr><th>Formateur</th><td>${formateurNom(s.formateur)}</td></tr>`) : ''}
      ${f.public_vise ? raw(html`<tr><th>Public visé</th><td class="pre">${String(f.public_vise).trim()}</td></tr>`) : ''}
      ${f.prerequis ? raw(html`<tr><th>Prérequis</th><td class="pre">${String(f.prerequis).trim()}</td></tr>`) : ''}
      <tr><th>Effectif</th><td>${stagiaires.length} stagiaire(s)</td></tr>
    </table>
    ${s.creneaux?.length ? raw(html`<h3>Calendrier</h3>${raw(listeCreneaux(s.creneaux))}`) : ''}
    <h3>Stagiaire(s)</h3>
    ${raw(listeStag)}

    ${raw(art('Moyens pédagogiques et techniques'))}
    ${raw(texte(f.methodes_pedagogiques))}
    ${raw(texte(f.moyens_techniques))}
    ${vide(f.methodes_pedagogiques) && vide(f.moyens_techniques) ? raw(html`<p class="muted">Précisés dans le programme de formation.</p>`) : ''}

    ${raw(art('Modalités d’évaluation et de suivi'))}
    ${raw(texte(f.modalites_evaluation, 'Évaluation des acquis en fin de formation.'))}
    <p>L'assiduité est justifiée par des feuilles d'émargement signées par demi-journée. Une attestation de fin de formation est remise à chaque stagiaire.</p>

    ${raw(art('Accessibilité'))}
    ${raw(texte(f.accessibilite))}
    <p>Les personnes en situation de handicap sont invitées à se signaler avant l'entrée en formation${org.referent_handicap_nom ? ` auprès du référent handicap, ${org.referent_handicap_nom}${org.referent_handicap_email ? ` (${org.referent_handicap_email})` : ''}` : ''}, afin d'étudier les adaptations possibles.</p>

    ${raw(art('Dispositions financières'))}
    <table class="kv">
      <tr><th>Prix de la formation</th><td>${vide(se.prix_ht) ? '…………………' : `${fmtEuro(se.prix_ht)} HT`}</td></tr>
      <tr><th>TVA</th><td>selon régime de l'organisme</td></tr>
      ${se.financement ? raw(html`<tr><th>Financement</th><td>${se.financement}</td></tr>`) : ''}
    </table>
    <p>Le règlement est effectué selon les modalités précisées sur la facture.</p>

    ${raw(art('Dédit, abandon et annulation'))}
    <p>En cas de renoncement par le ${cl ? 'client' : 'bénéficiaire'} à l'exécution de la présente convention, ou d'abandon en cours de formation, seules les prestations effectivement réalisées sont dues au titre de la formation professionnelle, dans les conditions prévues par les conditions générales de l'organisme.
      Toute somme éventuellement facturée au titre d'un dédit ne peut être imputée sur les fonds de la formation professionnelle continue.
      L'organisme de formation se réserve la possibilité de reporter ou d'annuler la session si les conditions pédagogiques ne sont pas réunies ; le ${cl ? 'client' : 'bénéficiaire'} en est alors informé dans les meilleurs délais et aucune somme n'est due pour les prestations non réalisées.</p>
    ${!cl ? raw(html`<p>Conformément à l'article L. 6353-5 du Code du travail, la personne physique dispose d'un délai de rétractation de dix jours à compter de la signature du contrat, par lettre recommandée avec avis de réception.</p>`) : ''}
    <p>Pour le surplus, il est renvoyé aux conditions générales de vente de l'organisme de formation${v.conditions_generales ? ', annexées à la présente convention' : ''}.</p>

    ${raw(art('Différends'))}
    <p>Les parties s'efforceront de régler à l'amiable tout différend relatif à l'exécution de la présente convention. À défaut, le litige sera porté devant les juridictions compétentes.</p>

    <p class="fait">${faitA(org, doc.created_at)}, en deux exemplaires originaux.</p>
    <div class="signatures">
      ${raw(signatureOrganisme(org, v.signature_cachet))}
      <div class="sig-bloc">
        <div class="sig-titre">${cl ? 'Pour le client' : 'Le bénéficiaire'}</div>
        <div>Date, nom, qualité, signature${cl ? ' et cachet' : ''}</div>
        <div class="sig-zone"></div>
      </div>
    </div>
    ${raw(pied(doc, org))}
    ${v.conditions_generales
      ? raw(html`<section class="annexe">
          <h1 class="doc-titre">Annexe – Conditions générales</h1>
          <div class="pre cg">${String(v.conditions_generales).trim()}</div>
        </section>`)
      : ''}`;
  return page(doc, v, corps, 'doc-convention');
}

/* ------------------------------------------------------------------ */
/* 2. Convocation                                                      */
/* ------------------------------------------------------------------ */

export function renderConvocation(doc, ctx = {}) {
  const s = doc.snapshot || {};
  const org = s.organisme || {};
  const v = doc.visuels || {};
  const se = s.session || {};
  const f = s.formation || {};
  const st = s.stagiaire || {};
  const acces = s.acces || {};
  const handicapContact = [org.referent_handicap_nom, org.referent_handicap_email, org.referent_handicap_tel].filter((x) => !vide(x)).join(' – ');

  const corps = html`
    ${raw(enTete(org, v.logo))}
    <div class="destinataire">
      <div><strong>${personne(st)}</strong></div>
      ${st.entreprise ? raw(html`<div>${st.entreprise}</div>`) : ''}
    </div>
    <h1 class="doc-titre">Convocation à la formation</h1>
    <p>${st.civilite === 'Mme' ? 'Madame' : st.civilite === 'M.' ? 'Monsieur' : 'Madame, Monsieur'},</p>
    <p>Nous avons le plaisir de vous confirmer votre inscription à la formation
      <strong>« ${se.intitule || f.titre || ''} »</strong> et vous prions de bien vouloir vous présenter aux dates et horaires suivants :</p>
    ${raw(listeCreneaux(s.creneaux || []) || html`<p>${periode(se.date_debut, se.date_fin)}</p>`)}
    <div class="infos">
      <div><span class="lbl">Lieu</span>${se.lieu || ''}</div>
      <div><span class="lbl">Modalité</span>${MODALITE[se.modalite] || se.modalite || ''}</div>
      <div><span class="lbl">Durée</span>${heures(s.heures_planifiees ?? se.duree_heures)}</div>
      ${s.formateur ? raw(html`<div><span class="lbl">Formateur</span>${formateurNom(s.formateur)}</div>`) : ''}
      ${f.public_vise ? raw(html`<div class="plein"><span class="lbl">Public visé</span><span class="pre">${String(f.public_vise).trim()}</span></div>`) : ''}
      ${f.prerequis ? raw(html`<div class="plein"><span class="lbl">Prérequis</span><span class="pre">${String(f.prerequis).trim()}</span></div>`) : ''}
    </div>

    ${acces.token || acces.code_session
      ? raw(html`<div class="encadre espace">
          ${ctx.qrPortail ? raw(html`<img src="${ctx.qrPortail}" alt="QR code d'accès à l'espace stagiaire">`) : ''}
          <div>
            <div class="encadre-titre">Votre espace stagiaire</div>
            <p>Scannez ce QR code avec votre téléphone pour accéder à votre espace (émargement, questionnaires, documents),
              ou rendez-vous sur :</p>
            <div class="mono">${ctx.portailBase || ''}</div>
            <p class="mono codes">Code session : <strong>${acces.code_session || ''}</strong> — Code personnel : <strong>${acces.code_acces || ''}</strong></p>
            <p class="small">Ces codes sont personnels : ne les communiquez pas.</p>
          </div>
        </div>`)
      : ''}

    <p>Si vous êtes en situation de handicap ou avez des besoins particuliers, contactez ${handicapContact ? `notre référent handicap : ${handicapContact}` : "l'organisme de formation"} avant le début de la formation afin que nous puissions étudier les adaptations nécessaires.</p>
    <p>En cas d'empêchement, merci de nous prévenir au plus tôt${org.telephone || org.email ? ` (${[org.telephone, org.email].filter((x) => !vide(x)).join(' – ')})` : ''}. Nous vous prions d'agréer nos salutations distinguées.</p>
    <div class="signatures">
      <p class="fait">${faitA(org, doc.created_at)}</p>
      ${raw(signatureOrganisme(org, v.signature_cachet, { titre: "L'organisme de formation" }))}
    </div>
    ${raw(pied(doc, org))}`;
  return page(doc, v, corps, 'doc-convocation');
}

/* ------------------------------------------------------------------ */
/* 3. Attestation de fin de formation                                  */
/* ------------------------------------------------------------------ */

export function renderAttestation(doc, ctx = {}) {
  const s = doc.snapshot || {};
  const org = s.organisme || {};
  const v = doc.visuels || {};
  const se = s.session || {};
  const f = s.formation || {};
  const st = s.stagiaire || {};
  const evals = s.evaluations || [];

  const tableEvals = evals.length
    ? html`<h2>Résultats de l'évaluation des acquis</h2>
      <table class="grille">
        <thead><tr><th>Évaluation</th><th>Moment</th><th class="num">Score</th><th class="num">%</th></tr></thead>
        <tbody>${evals.map((e) => {
          const pct = Number(e.score_max) > 0 ? Math.round((Number(e.score) / Number(e.score_max)) * 100) : null;
          return raw(html`<tr><td>${e.titre || ''}</td><td>${MOMENT[e.moment] || e.moment || ''}</td>
            <td class="num">${fmtNum(e.score, 2)} / ${fmtNum(e.score_max, 2)}</td><td class="num">${pct === null ? '' : `${pct} %`}</td></tr>`);
        })}</tbody>
      </table>`
    : '';

  const corps = html`
    ${raw(enTete(org, v.logo, 'Attestation de fin de formation'))}
    <p class="corps-attest">Je soussigné(e) <strong>${org.representant_nom || '…………………'}</strong>${org.representant_qualite ? `, ${org.representant_qualite}` : ''}
      de l'organisme de formation <strong>${org.nom || ''}</strong>, atteste que
      <strong>${personne(st)}</strong>${st.entreprise ? raw(html`, de l'entreprise <strong>${st.entreprise}</strong>,`) : ''}
      a suivi la formation <strong>« ${se.intitule || f.titre || ''} »</strong>
      ${periode(se.date_debut, se.date_fin)}, d'une durée de <strong>${fmtNum(s.heures_realisees ?? 0, 2)} heures</strong>${vide(s.heures_planifiees) ? '' : ` (sur ${heures(s.heures_planifiees)} prévues)`}.</p>
    <table class="kv">
      <tr><th>Modalité</th><td>${MODALITE[se.modalite] || se.modalite || ''}</td></tr>
      ${se.lieu ? raw(html`<tr><th>Lieu</th><td>${se.lieu}</td></tr>`) : ''}
      ${s.dates_presence?.length ? raw(html`<tr><th>Jours de présence</th><td>${s.dates_presence.map((d) => fmtDate(d)).join(', ')}</td></tr>`) : ''}
    </table>
    <h2>Objectifs de la formation</h2>
    ${raw(texte(f.objectifs, 'Non renseignés.'))}
    ${raw(tableEvals)}
    <p class="fait">${faitA(org, doc.created_at)}</p>
    <div class="signatures">
      ${raw(blocQrVerif(ctx))}
      ${raw(signatureOrganisme(org, v.signature_cachet, { titre: 'Signature et cachet' }))}
    </div>
    ${raw(pied(doc, org))}`;
  return page(doc, v, corps, 'doc-attestation');
}

/* ------------------------------------------------------------------ */
/* 4. Certificat de réalisation                                        */
/* ------------------------------------------------------------------ */

// Texte repris du modèle ministériel (juin 2020) — à revérifier contre la version officielle en vigueur.
export function renderCertificat(doc, ctx = {}) {
  const s = doc.snapshot || {};
  const org = s.organisme || {};
  const v = doc.visuels || {};
  const se = s.session || {};
  const f = s.formation || {};
  const st = s.stagiaire || {};
  const nomPrenom = [st.nom, st.prenom].filter((x) => !vide(x)).join(' ');
  const case_ = (coche, libelle) => html`<li><span class="case">${coche ? '☒' : '☐'}</span> ${libelle}</li>`;

  const corps = html`
    ${raw(enTete(org, v.logo, 'Certificat de réalisation'))}
    <div class="certificat">
      <p>Je soussigné(e) <strong>${org.representant_nom || '…………………'}</strong>, représentant légal du dispensateur de l'action concourant au développement des compétences
        <strong>${org.nom || ''}</strong>,</p>
      <p>atteste que :</p>
      <p class="cert-nom"><strong>${nomPrenom}</strong></p>
      <p>salarié(e) de l'entreprise <strong>${st.entreprise || '…………………'}</strong></p>
      <p>a suivi l'action <strong>${se.intitule || f.titre || ''}</strong></p>
      <p>Nature de l'action concourant au développement des compétences :</p>
      <ul class="cases">
        ${raw(case_(true, 'action de formation'))}
        ${raw(case_(false, 'bilan de compétences'))}
        ${raw(case_(false, "action de VAE"))}
        ${raw(case_(false, 'action de formation par apprentissage'))}
      </ul>
      <p>qui s'est déroulée du <strong>${fmtDate(se.date_debut) || '…………'}</strong> au <strong>${fmtDate(se.date_fin || se.date_debut) || '…………'}</strong>
        pour une durée de <strong>${fmtNum(s.heures_realisees ?? 0, 2)}</strong> heures.</p>
      <p class="engagement">Sans préjudice des délais imposés par les règles fiscales, comptables ou commerciales, je m'engage à conserver l'ensemble des pièces justificatives qui ont permis d'établir le présent certificat pendant une durée de 3 ans à compter de la fin de l'année du dernier paiement. En cas de cofinancement des fonds européens la durée de conservation est étendue conformément aux obligations conventionnelles spécifiques.</p>
      <p class="fait">${faitA(org, doc.created_at)}</p>
    </div>
    <div class="signatures">
      ${raw(blocQrVerif(ctx))}
      ${raw(signatureOrganisme(org, v.signature_cachet, { titre: 'Cachet et signature du responsable du dispensateur de formation' }))}
    </div>
    ${raw(pied(doc, org))}`;
  return page(doc, v, corps, 'doc-certificat');
}

/* ------------------------------------------------------------------ */
/* 5. Feuille d'émargement                                             */
/* ------------------------------------------------------------------ */

const MODE = { portail: 'portail', tablette: 'tablette', manuel: 'saisie manuelle' };

function celluleSignature(sig) {
  if (!sig) return '';
  if (sig.statut === 'absent') return html`<span class="absent">Absent</span>`;
  if (sig.statut === 'absent_justifie') return html`<span class="absent">Absent justifié</span>`;
  const src = imageSure(sig.signature);
  const h = heureLocale(sig.signed_at);
  return html`${src ? raw(html`<img class="sig-img" src="${src}" alt="Signature">`) : raw(html`<span>Présent</span>`)}
    <div class="sig-meta">${h ? `signé à ${h}` : ''}${sig.mode ? ` (${MODE[sig.mode] || sig.mode})` : ''}</div>`;
}

/**
 * Données vivantes (GET /sessions/{id}/feuille-emargement), ou feuille vierge
 * construite à partir d'un snapshot (document « feuille_emargement » émis).
 */
export function renderFeuille(data, { doc = null } = {}) {
  const s = data.session || {};
  const org = data.organisme || {};
  const visuels = { logo: org.logo, couleur: org.couleur, ...(data.visuels || {}) };
  const inscrits = (s.inscriptions || []).filter((i) => i.statut !== 'annule');
  const sigIndex = new Map();
  for (const g of data.signatures || []) sigIndex.set(`${g.creneau_id}:${g.inscription_id}`, g);
  const formIndex = new Map();
  for (const g of data.formateur_signatures || []) formIndex.set(String(g.id), g);
  const jours = creneauxParJour(s.creneaux || []);
  const maxParJour = Math.max(0, ...jours.map((j) => j.creneaux.length));
  const lignesVierges = inscrits.length ? 0 : 10;
  const formation = s.formation || {};

  const tables = jours.map((j) => {
    const lignes = inscrits.map((i) =>
      raw(html`<tr>
        <td class="stag"><strong>${[i.nom, i.prenom].filter((x) => !vide(x)).join(' ')}</strong>${i.entreprise ? raw(html`<div class="small">${i.entreprise}</div>`) : ''}${i.statut === 'abandon' ? raw(html`<div class="small">(abandon)</div>`) : ''}</td>
        ${j.creneaux.map((c) => raw(html`<td class="sig-cell">${raw(celluleSignature(c.id != null ? sigIndex.get(`${c.id}:${i.id}`) : null))}</td>`))}
      </tr>`),
    );
    for (let k = 0; k < lignesVierges; k++) {
      lignes.push(raw(html`<tr><td class="stag">&nbsp;</td>${j.creneaux.map(() => raw('<td class="sig-cell"></td>'))}</tr>`));
    }
    const ligneFormateur = html`<tr class="formateur">
      <td class="stag"><strong>Formateur</strong>${s.formateur ? raw(html`<div class="small">${formateurNom(s.formateur)}</div>`) : ''}</td>
      ${j.creneaux.map((c) => {
        const g = c.id != null ? formIndex.get(String(c.id)) : null;
        const src = imageSure(g?.formateur_signature);
        const h = heureLocale(g?.formateur_signed_at);
        return raw(html`<td class="sig-cell">${src ? raw(html`<img class="sig-img" src="${src}" alt="Signature du formateur">`) : ''}${h ? raw(html`<div class="sig-meta">signé à ${h}</div>`) : ''}</td>`);
      })}
    </tr>`;
    return raw(html`<section class="jour">
      <h2>${fmtDateLong(j.date)}</h2>
      <table class="grille emargement">
        <colgroup><col class="col-stag">${j.creneaux.map(() => raw('<col>'))}</colgroup>
        <thead><tr><th>Stagiaire</th>${j.creneaux.map((c) => raw(html`<th>${libelleCreneau(c, j.creneaux)}</th>`))}</tr></thead>
        <tbody>${lignes}${raw(ligneFormateur)}</tbody>
      </table>
    </section>`);
  });

  const corps = html`
    ${raw(enTete(org, visuels.logo, "Feuille d'émargement"))}
    <table class="kv">
      <tr><th>Formation</th><td>${s.intitule || formation.titre || ''}</td></tr>
      ${s.reference ? raw(html`<tr><th>Référence</th><td>${s.reference}</td></tr>`) : ''}
      <tr><th>Dates</th><td>${periode(s.date_debut, s.date_fin)}</td></tr>
      ${s.lieu ? raw(html`<tr><th>Lieu</th><td>${s.lieu}</td></tr>`) : ''}
      ${s.formateur ? raw(html`<tr><th>Formateur</th><td>${formateurNom(s.formateur)}</td></tr>`) : ''}
      ${s.client ? raw(html`<tr><th>Client</th><td>${s.client.raison_sociale || ''}</td></tr>`) : ''}
    </table>
    ${tables.length ? tables : raw(html`<p class="muted">Aucun créneau planifié.</p>`)}
    <p class="small mention-sig">Les signatures électroniques sont horodatées ; adresse IP et appareil conservés par l'organisme.</p>
    ${doc ? raw(pied(doc, org)) : ''}`;
  return {
    html: page(doc, visuels, corps, 'doc-feuille'),
    paysage: maxParJour > 2,
  };
}

/** Feuille vierge depuis un document émis (le snapshot ne contient pas les stagiaires). */
function renderFeuilleDepuisSnapshot(doc) {
  const s = doc.snapshot || {};
  return renderFeuille(
    {
      session: { ...(s.session || {}), formation: s.formation, formateur: s.formateur, client: s.client, creneaux: s.creneaux || [], inscriptions: [] },
      organisme: s.organisme || {},
      visuels: doc.visuels || {},
    },
    { doc },
  );
}

/* ------------------------------------------------------------------ */
/* Aiguillage                                                          */
/* ------------------------------------------------------------------ */

/**
 * Rend un document émis. ctx = { qrVerif, verifUrl, qrPortail, portailBase } (data URLs pré-générées).
 * Renvoie { html, paysage }.
 */
export function renderDocument(doc, ctx = {}) {
  switch (doc.type) {
    case 'convention':
      return { html: renderConvention(doc, ctx), paysage: false };
    case 'convocation':
      return { html: renderConvocation(doc, ctx), paysage: false };
    case 'attestation':
      return { html: renderAttestation(doc, ctx), paysage: false };
    case 'certificat_realisation':
      return { html: renderCertificat(doc, ctx), paysage: false };
    case 'feuille_emargement':
      return renderFeuilleDepuisSnapshot(doc);
    default:
      return { html: html`<article class="doc"><p>Type de document non pris en charge : ${TYPE_DOCUMENT[doc.type] || doc.type}</p></article>`, paysage: false };
  }
}

