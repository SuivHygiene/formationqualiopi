// Page publique de vérification d'authenticité d'un document émis.
import '../styles.css';
import './portail.css';
import { api } from '../api.js';
import { html, raw, fmtDate } from '../ui.js';
import { TYPE_DOCUMENT } from '../labels.js';
import { normalizeVerifCode, isVerifCode } from './logic.js';

const app = document.getElementById('app');

function formHtml(value = '') {
  return html`<section class="card">
    <h2>Vérifier un document</h2>
    <p class="muted">Saisissez le code de vérification (16 caractères) imprimé sur le document ou lu dans son QR code.</p>
    <form class="vf-form" novalidate>
      <label for="vf-code" class="sr-only">Code de vérification</label>
      <input id="vf-code" name="code" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="24" value="${value}" placeholder="ex. ab12cd34ef56gh78" aria-describedby="vf-err">
      <button type="submit" class="btn btn-primary">Vérifier</button>
    </form>
    <div id="vf-err" class="field-error" aria-live="polite"></div>
  </section>`;
}

function shell(inner) {
  app.innerHTML = html`<div class="pt-shell">
    <header class="pt-header"><span class="pt-org">Vérification de document</span></header>
    <main><div aria-live="polite" id="vf-result">${raw(inner)}</div></main>
  </div>`;
  const form = app.querySelector('.vf-form');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = normalizeVerifCode(form.elements.code.value);
    if (!isVerifCode(code)) {
      app.querySelector('#vf-err').textContent = 'Le code doit comporter 16 lettres ou chiffres.';
      form.elements.code.classList.add('invalid');
      form.elements.code.focus();
      return;
    }
    if (location.hash === '#' + code) verify(code);
    else location.hash = code; // déclenche hashchange → verify
  });
}

function detailsHtml(d) {
  const dates =
    d.dates?.debut && d.dates?.fin && d.dates.debut !== d.dates.fin
      ? `Du ${fmtDate(d.dates.debut)} au ${fmtDate(d.dates.fin)}`
      : d.dates?.debut
        ? fmtDate(d.dates.debut)
        : '';
  const rows = [
    ['Document', TYPE_DOCUMENT[d.type] || d.type],
    ['Numéro', d.numero],
    ['Émis le', fmtDate(d.emis_le)],
    ['Organisme', d.organisme?.nom],
    ['N° de déclaration d’activité', d.organisme?.nda],
    ['Formation', d.formation],
    ['Dates', dates],
    ['Stagiaire', d.stagiaire],
    ['Heures réalisées', d.heures_realisees != null && d.heures_realisees !== '' ? `${Number(d.heures_realisees).toLocaleString('fr-FR')} h` : ''],
  ].filter(([, v]) => v !== null && v !== undefined && v !== '');
  return html`<div class="vf-banner vf-ok" role="status">
      <span class="vf-icon" aria-hidden="true">✔</span>
      <div><h2>Document authentique</h2><p>Ce document a bien été émis par l’organisme indiqué ci-dessous.</p></div>
    </div>
    <section class="card">
      <h2>Détails du document</h2>
      <dl class="pt-info">${raw(rows.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`).join(''))}</dl>
      <p class="muted pt-help" style="margin-top:12px">Pour protéger la vie privée, seule l’initiale du nom du stagiaire est affichée. Comparez ces informations avec celles du document présenté.</p>
    </section>`;
}

async function verify(code) {
  document.title = 'Vérification de document';
  shell(html`<p class="loader" role="status">Vérification en cours…</p>`);
  try {
    const d = await api('GET', '/verification/' + encodeURIComponent(code));
    if (!d?.valide) throw Object.assign(new Error('invalide'), { status: 404 });
    shell(detailsHtml(d) + formHtml());
  } catch (err) {
    const banner =
      err.status === 404
        ? html`<div class="vf-banner vf-ko" role="alert">
            <span class="vf-icon" aria-hidden="true">✖</span>
            <div><h2>Document introuvable</h2><p>Ce document n’a pas été émis par cet outil ou le code est erroné.</p></div>
          </div>`
        : err.status === 429
          ? html`<div class="alert alert-error" role="alert">Trop de vérifications depuis votre connexion. Réessayez dans quelques minutes.</div>`
          : html`<div class="alert alert-error" role="alert">${err.message || 'Vérification impossible pour le moment.'}</div>`;
    shell(banner + formHtml(code));
  }
}

function route() {
  const code = normalizeVerifCode(location.hash);
  if (!code) return shell(formHtml());
  if (!isVerifCode(code)) {
    return shell(
      html`<div class="vf-banner vf-ko" role="alert">
        <span class="vf-icon" aria-hidden="true">✖</span>
        <div><h2>Document introuvable</h2><p>Ce document n’a pas été émis par cet outil ou le code est erroné.</p></div>
      </div>` + formHtml(code),
    );
  }
  verify(code);
}

window.addEventListener('hashchange', route);
route();
