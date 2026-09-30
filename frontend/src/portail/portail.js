// Portail stagiaire (sans compte) : émargement, questionnaires, documents.
import '../styles.css';
import './portail.css';
import { api, ApiError } from '../api.js';
import { html, raw, fmtDate, fmtDateLong, fmtHeure, toast, toastError, confirmDialog } from '../ui.js';
import { signaturePad } from '../signature.js';
import { MODALITE, MOMENT, TYPE_DOCUMENT, TYPE_QUESTIONNAIRE } from '../labels.js';
import {
  TOKEN_KEY,
  TOKEN_RE,
  ECHELLE,
  tokenFromHash,
  normalizeCodeSession,
  normalizeCodeAcces,
  safeColor,
  onColor,
  periode,
  groupCreneauxParJour,
  statutCreneau,
  creneauASigner,
  todayISO,
  heureLocale,
  fieldName,
  readAnswers,
  validateAnswers,
  compactAnswers,
} from './logic.js';

const app = document.getElementById('app');
let token = null;
let moi = null;
let refreshTimer = null;

/* ---------- Jeton ---------- */

function loadToken() {
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    return t && TOKEN_RE.test(t) ? t : null;
  } catch {
    return null;
  }
}
function saveToken(t) {
  token = t;
  try {
    localStorage.setItem(TOKEN_KEY, t);
  } catch {
    /* stockage indisponible : le jeton reste en mémoire pour cette visite */
  }
}
function clearToken() {
  token = null;
  moi = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignoré */
  }
}

const papi = (method, path, body) => api(method, path, body, { 'X-Access-Token': token });

/* ---------- Utilitaires d'affichage ---------- */

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const jour = (d) => cap(fmtDateLong(d));
const plage = (c) => `${fmtHeure(c.heure_debut)}–${fmtHeure(c.heure_fin)}`;

function applyTheme(org) {
  const c = safeColor(org?.couleur);
  const root = document.documentElement.style;
  if (c) {
    root.setProperty('--primary', c);
    root.setProperty('--on-primary', onColor(c));
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', c);
  } else {
    root.removeProperty('--primary');
    root.removeProperty('--on-primary');
  }
}

function logoSrc(logo) {
  const v = String(logo || '');
  return /^data:image\/(png|jpe?g|webp|gif|svg\+xml)[;,]/i.test(v) || /^https:\/\//i.test(v) ? v : '';
}

function setTitle(t) {
  document.title = t ? `${t} — Espace stagiaire` : 'Espace stagiaire';
}

function loading(msg = 'Chargement…') {
  app.innerHTML = html`<div class="pt-shell"><p class="loader" role="status">${msg}</p></div>`;
}

/* ---------- Connexion ---------- */

function renderLogin(message = '', tone = 'error') {
  stopRefresh();
  applyTheme(null);
  setTitle('Connexion');
  const params = new URLSearchParams(location.search);
  const preset = normalizeCodeSession(params.get('s'));
  app.innerHTML = html`<main class="auth-page">
    <div class="auth-card">
      <h1>Espace stagiaire</h1>
      <p class="sub">Émargement, questionnaires et documents de votre formation.</p>
      <div aria-live="polite" id="login-msg">${message ? raw(html`<div class="alert alert-${tone === 'error' ? 'error' : 'info'}">${message}</div>`) : ''}</div>
      <form novalidate>
        <div class="field">
          <label for="code_session">Code session</label>
          <input id="code_session" name="code_session" class="pt-code" autocomplete="off" autocapitalize="characters"
            spellcheck="false" maxlength="6" required value="${preset}" aria-describedby="help_session">
          <small id="help_session">6 caractères, affiché en salle ou sur votre convocation.</small>
        </div>
        <div class="field">
          <label for="code_acces">Code personnel</label>
          <input id="code_acces" name="code_acces" class="pt-code" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code"
            maxlength="6" required aria-describedby="help_acces">
          <small id="help_acces">6 chiffres, indiqué sur votre convocation.</small>
        </div>
        <button type="submit" class="btn btn-primary pt-btn-block">Accéder à ma formation</button>
      </form>
    </div>
  </main>`;
  const form = app.querySelector('form');
  const cs = form.elements.code_session;
  const ca = form.elements.code_acces;
  const msg = app.querySelector('#login-msg');
  cs.addEventListener('input', () => {
    const v = normalizeCodeSession(cs.value);
    if (v !== cs.value) cs.value = v;
  });
  ca.addEventListener('input', () => {
    const v = normalizeCodeAcces(ca.value);
    if (v !== ca.value) ca.value = v;
  });
  setTimeout(() => (preset.length === 6 ? ca : cs).focus(), 30);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code_session = normalizeCodeSession(cs.value);
    const code_acces = normalizeCodeAcces(ca.value);
    cs.classList.toggle('invalid', code_session.length !== 6);
    ca.classList.toggle('invalid', code_acces.length !== 6);
    if (code_session.length !== 6 || code_acces.length !== 6) {
      msg.innerHTML = html`<div class="alert alert-error">Saisissez le code session (6 caractères) et votre code personnel (6 chiffres).</div>`;
      return;
    }
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    msg.innerHTML = '';
    try {
      const r = await api('POST', '/portail/connexion', { code_session, code_acces });
      saveToken(r.token);
      if (location.search) history.replaceState(null, '', location.pathname);
      await start();
    } catch (err) {
      const text =
        err.status === 401
          ? 'Codes incorrects. Vérifiez votre convocation ou demandez-les au formateur.'
          : err.status === 429
            ? 'Trop de tentatives. Patientez quelques minutes avant de réessayer.'
            : err.message;
      msg.innerHTML = html`<div class="alert alert-error">${text}</div>`;
      btn.disabled = false;
    }
  });
}

/* ---------- Chargement des données ---------- */

async function loadMoi() {
  moi = await papi('GET', '/portail/moi');
  applyTheme(moi.organisme);
  return moi;
}

function handleAuthError(err) {
  if (err instanceof ApiError && err.status === 401) {
    clearToken();
    renderLogin('Votre lien n’est plus valide. Connectez-vous avec vos codes.');
    return true;
  }
  return false;
}

async function start() {
  loading();
  try {
    await loadMoi();
  } catch (err) {
    if (handleAuthError(err)) return;
    app.innerHTML = html`<div class="pt-shell"><div class="alert alert-error" role="alert">${err.message}</div>
      <button class="btn btn-primary pt-btn-block" data-retry>Réessayer</button></div>`;
    app.querySelector('[data-retry]').addEventListener('click', start);
    return;
  }
  route();
  startRefresh();
}

/** Rafraîchit l'état toutes les minutes (ouverture des créneaux) quand la page est visible. */
function startRefresh() {
  stopRefresh();
  refreshTimer = setInterval(async () => {
    if (document.hidden || currentRoute().name !== 'home' || document.querySelector('.pt-sheet')) return;
    try {
      await loadMoi();
      renderHome({ keepScroll: true });
    } catch (err) {
      handleAuthError(err);
    }
  }, 60000);
}
function stopRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
}

/* ---------- Routage interne (#q=ID) ---------- */

function currentRoute() {
  const m = /^#q=(\d+)$/.exec(location.hash);
  return m ? { name: 'questionnaire', id: m[1] } : { name: 'home' };
}

function route() {
  if (!token) return renderLogin();
  const r = currentRoute();
  if (r.name === 'questionnaire') renderQuestionnaire(r.id);
  else renderHome();
}

window.addEventListener('hashchange', () => {
  const t = tokenFromHash(location.hash);
  if (t) {
    saveToken(t);
    history.replaceState(null, '', location.pathname + location.search);
    start();
    return;
  }
  if (token && moi) route();
});

/* ---------- Accueil ---------- */

function header() {
  const o = moi.organisme || {};
  const src = logoSrc(o.logo);
  return html`<header class="pt-header">
    ${src ? raw(html`<img class="pt-logo" src="${src}" alt="">`) : ''}
    <span class="pt-org">${o.nom || 'Organisme de formation'}</span>
  </header>`;
}

function blocCreneauEnCours(creneaux) {
  const c = creneauASigner(creneaux);
  if (!c) return '';
  return html`<section class="pt-now" aria-labelledby="now-title">
    <h2 id="now-title">Signature ouverte</h2>
    <p>${jour(c.date)}<br><strong>${periode(c.heure_debut)} ${plage(c)}</strong></p>
    <button type="button" class="btn pt-btn-block pt-btn-light" data-sign="${c.id}">Signer ma présence</button>
  </section>`;
}

function statutHtml(c, today) {
  const s = statutCreneau(c, today);
  if (s.key === 'signe') {
    const h = heureLocale(c.signed_at);
    return html`<span class="badge badge-green">✔ Signé${h ? ` à ${h}` : ''}</span>`;
  }
  if (s.key === 'a_signer') {
    return html`<button type="button" class="btn btn-primary" data-sign="${c.id}">À signer</button>`;
  }
  return html`<span class="badge badge-${s.tone}">${s.label}</span>`;
}

function sectionEmargement() {
  const groups = groupCreneauxParJour(moi.creneaux);
  const today = todayISO();
  const body = groups.length
    ? groups
        .map(
          (g) => html`<div class="pt-day ${g.date === today ? 'is-today' : ''}">
            <h3>${jour(g.date)}${g.date === today ? raw(' <span class="badge badge-blue">Aujourd’hui</span>') : ''}</h3>
            <ul class="pt-list">${raw(
              g.creneaux
                .map(
                  (c) => html`<li class="pt-row">
                    <span class="pt-row-main"><strong>${periode(c.heure_debut)}</strong> <span class="muted">${plage(c)}</span></span>
                    <span class="pt-row-side">${raw(statutHtml(c, today))}</span>
                  </li>`,
                )
                .join(''),
            )}</ul>
          </div>`,
        )
        .join('')
    : html`<p class="muted">Aucun créneau planifié pour le moment.</p>`;
  return html`<section class="card" aria-labelledby="sec-emarg">
    <h2 id="sec-emarg">Émargement</h2>
    <p class="muted pt-help">La signature est possible de 30 minutes avant le début jusqu’à 1 heure après la fin de chaque demi-journée. Passé ce délai, adressez-vous au formateur.</p>
    ${raw(body)}
  </section>`;
}

function sectionQuestionnaires() {
  const list = moi.questionnaires || [];
  const body = list.length
    ? html`<ul class="pt-list">${raw(
        list
          .map(
            (q) => html`<li class="pt-row">
              <span class="pt-row-main"><strong>${q.titre}</strong><br><small>${MOMENT[q.moment] || TYPE_QUESTIONNAIRE[q.type] || ''}</small></span>
              <span class="pt-row-side">${
                q.submitted_at
                  ? raw(html`<a class="badge badge-green pt-link-badge" href="#q=${q.id}">Répondu le ${fmtDate(q.submitted_at)}</a>`)
                  : raw(html`<a class="btn btn-primary" href="#q=${q.id}">Répondre</a>`)
              }</span>
            </li>`,
          )
          .join(''),
      )}</ul>`
    : html`<p class="muted">Aucun questionnaire à remplir pour le moment.</p>`;
  return html`<section class="card" aria-labelledby="sec-quest"><h2 id="sec-quest">Questionnaires</h2>${raw(body)}</section>`;
}

function sectionDocuments() {
  const list = moi.documents || [];
  const body = list.length
    ? html`<ul class="pt-list">${raw(
        list
          .map(
            (d) => html`<li class="pt-row">
              <span class="pt-row-main"><strong>${TYPE_DOCUMENT[d.type] || d.type}</strong><br><small>N° ${d.numero} · émis le ${fmtDate(d.created_at)}</small></span>
              <span class="pt-row-side"><a class="btn" href="/verification.html#${d.code_verif}">Vérifier</a></span>
            </li>`,
          )
          .join(''),
      )}</ul>`
    : html`<p class="muted">Aucun document émis pour le moment.</p>`;
  return html`<section class="card" aria-labelledby="sec-docs">
    <h2 id="sec-docs">Mes documents</h2>
    ${raw(body)}
    <p class="muted pt-help">Les documents (convocation, attestation, certificat de réalisation) vous sont remis directement par l’organisme de formation. Le lien « Vérifier » permet à toute personne de contrôler leur authenticité.</p>
  </section>`;
}

function sectionAide() {
  const o = moi.organisme || {};
  const has = o.referent_handicap_nom || o.referent_handicap_email || o.referent_handicap_tel;
  const contact = has
    ? html`<p>Votre référent handicap${o.referent_handicap_nom ? raw(html` : <strong>${o.referent_handicap_nom}</strong>`) : ''}</p>
      <div class="pt-contact">
        ${o.referent_handicap_tel ? raw(html`<a class="btn" href="tel:${String(o.referent_handicap_tel).replace(/[^\d+]/g, '')}">📞 ${o.referent_handicap_tel}</a>`) : ''}
        ${o.referent_handicap_email ? raw(html`<a class="btn" href="mailto:${o.referent_handicap_email}">✉ ${o.referent_handicap_email}</a>`) : ''}
      </div>`
    : html`<p>Signalez-le à votre formateur ou à l’organisme de formation.</p>`;
  return html`<section class="card" aria-labelledby="sec-aide">
    <h2 id="sec-aide">Besoin d’aide / situation de handicap</h2>
    <p class="muted">Un besoin d’adaptation (accessibilité, rythme, supports…) ? Nous en tenons compte, en toute confidentialité.</p>
    ${raw(contact)}
  </section>`;
}

function renderHome({ keepScroll = false } = {}) {
  const y = window.scrollY;
  const s = moi.session || {};
  setTitle(s.intitule);
  const dates =
    s.date_debut && s.date_fin && s.date_debut !== s.date_fin
      ? `Du ${fmtDate(s.date_debut)} au ${fmtDate(s.date_fin)}`
      : s.date_debut
        ? `Le ${fmtDate(s.date_debut)}`
        : '';
  app.innerHTML = html`<div class="pt-shell">
    ${raw(header())}
    <main>
      <h1 class="pt-hello">Bonjour ${moi.stagiaire?.prenom || ''}</h1>
      ${raw(blocCreneauEnCours(moi.creneaux))}
      <section class="card pt-formation" aria-labelledby="sec-form">
        <h2 id="sec-form">${s.intitule}</h2>
        ${s.statut === 'annulee' ? raw('<div class="alert alert-error">Cette session a été annulée.</div>') : ''}
        <dl class="pt-info">
          ${dates ? raw(html`<dt>Dates</dt><dd>${dates}</dd>`) : ''}
          ${s.lieu ? raw(html`<dt>Lieu</dt><dd>${s.lieu}</dd>`) : ''}
          ${s.modalite ? raw(html`<dt>Modalité</dt><dd>${MODALITE[s.modalite] || s.modalite}</dd>`) : ''}
          ${s.formateur ? raw(html`<dt>Formateur</dt><dd>${s.formateur}</dd>`) : ''}
        </dl>
      </section>
      ${raw(sectionEmargement())}
      ${raw(sectionQuestionnaires())}
      ${raw(sectionDocuments())}
      ${raw(sectionAide())}
      <div class="pt-footer">
        <button type="button" class="btn btn-ghost" data-logout>Se déconnecter de cet appareil</button>
      </div>
    </main>
  </div>`;
  app.querySelectorAll('[data-sign]').forEach((b) =>
    b.addEventListener('click', () => {
      const c = moi.creneaux.find((x) => String(x.id) === b.dataset.sign);
      if (c) openSignature(c);
    }),
  );
  app.querySelector('[data-logout]').addEventListener('click', async () => {
    const ok = await confirmDialog('Vous devrez ressaisir vos codes pour revenir sur cet appareil.', { ok: 'Se déconnecter' });
    if (!ok) return;
    clearToken();
    renderLogin('Vous êtes déconnecté de cet appareil.', 'info');
  });
  if (keepScroll) window.scrollTo(0, y);
}

/* ---------- Signature ---------- */

function openSignature(c) {
  const sheet = document.createElement('div');
  sheet.className = 'pt-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', 'sig-title');
  sheet.innerHTML = html`<div class="pt-sheet-inner">
    <div class="pt-sheet-head">
      <h2 id="sig-title">Signer ma présence</h2>
      <button type="button" class="icon-btn pt-close" data-cancel aria-label="Fermer">✕</button>
    </div>
    <p>${jour(c.date)} — <strong>${periode(c.heure_debut)} ${plage(c)}</strong></p>
    <p class="muted">${moi.stagiaire?.prenom} ${moi.stagiaire?.nom}, signez dans le cadre ci-dessous avec le doigt.</p>
    <canvas class="signature-box pt-sig" aria-label="Zone de signature"></canvas>
    <div class="pt-sig-msg" aria-live="assertive"></div>
    <div class="pt-sheet-actions">
      <button type="button" class="btn" data-clear>Effacer</button>
      <button type="button" class="btn btn-primary" data-ok>Valider ma signature</button>
    </div>
  </div>`;
  document.body.appendChild(sheet);
  document.body.classList.add('no-scroll');
  const canvas = sheet.querySelector('canvas');
  const pad = signaturePad(canvas);
  const msg = sheet.querySelector('.pt-sig-msg');
  const onResize = () => pad.resize();
  window.addEventListener('resize', onResize);
  const onKey = (e) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  const opener = document.activeElement;
  function close() {
    window.removeEventListener('resize', onResize);
    document.removeEventListener('keydown', onKey);
    sheet.remove();
    document.body.classList.remove('no-scroll');
    opener?.focus?.();
  }
  sheet.querySelector('[data-cancel]').addEventListener('click', close);
  sheet.querySelector('[data-clear]').addEventListener('click', () => {
    pad.clear();
    msg.textContent = '';
  });
  const ok = sheet.querySelector('[data-ok]');
  ok.addEventListener('click', async () => {
    if (pad.isEmpty()) {
      msg.innerHTML = html`<div class="alert alert-error">Veuillez signer dans le cadre avant de valider.</div>`;
      return;
    }
    ok.disabled = true;
    msg.textContent = 'Envoi…';
    try {
      moi = await papi('POST', '/portail/emargement', { creneau_id: c.id, signature: pad.toDataURL() });
      close();
      renderHome({ keepScroll: true });
      toast('Présence enregistrée. Merci !', 'success');
    } catch (err) {
      if (err.status === 401) {
        close();
        handleAuthError(err);
        return;
      }
      if (err.status === 409) {
        close();
        toast(err.message, 'info');
        try {
          await loadMoi();
          renderHome({ keepScroll: true });
        } catch {
          /* ignoré */
        }
        return;
      }
      msg.innerHTML = html`<div class="alert alert-error">${err.message}</div>`;
      ok.disabled = false;
    }
  });
  setTimeout(() => sheet.querySelector('[data-ok]').focus(), 30);
}

/* ---------- Questionnaire ---------- */

function questionHtml(q, i) {
  const name = fieldName(q.id);
  const id = `qf_${q.id}`;
  const star = q.obligatoire ? raw(' <span class="req" aria-hidden="true">*</span><span class="sr-only">(obligatoire)</span>') : '';
  const err = html`<div class="field-error" id="err_${q.id}" data-error="${q.id}" aria-live="polite"></div>`;
  const title = html`<span class="pt-qnum">${i + 1}.</span> ${q.libelle}${star}`;
  const choice = (type, value, label, extra = '') =>
    html`<label class="pt-choice ${extra}"><input type="${type}" name="${name}" value="${value}"><span>${label}</span></label>`;
  let control = '';
  switch (q.type) {
    case 'echelle':
      control = html`<div class="pt-scale">${raw(ECHELLE.map(([v, l]) => html`<label class="pt-scale-item"><input type="radio" name="${name}" value="${v}"><span><b>${v}</b><small>${l}</small></span></label>`).join(''))}</div>`;
      break;
    case 'oui_non':
      control = html`<div class="pt-yesno">${raw(choice('radio', 'oui', 'Oui') + choice('radio', 'non', 'Non'))}</div>`;
      break;
    case 'choix_unique':
      control = html`<div class="pt-choices">${raw((q.options || []).map((o, k) => choice('radio', k, o)).join(''))}</div>`;
      break;
    case 'choix_multiple':
      control = html`<p class="muted pt-help">Plusieurs réponses possibles.</p><div class="pt-choices">${raw((q.options || []).map((o, k) => choice('checkbox', k, o)).join(''))}</div>`;
      break;
    default:
      return html`<div class="card pt-q" data-q="${q.id}">
        <label for="${id}" class="pt-q-title">${raw(title)}</label>
        <textarea id="${id}" name="${name}" rows="4" maxlength="5000" aria-describedby="err_${q.id}"></textarea>
        ${raw(err)}
      </div>`;
  }
  return html`<fieldset class="card pt-q" data-q="${q.id}" aria-describedby="err_${q.id}">
    <legend class="pt-q-title">${raw(title)}</legend>
    ${raw(control)}
    ${raw(err)}
  </fieldset>`;
}

function showErrors(form, errors) {
  form.querySelectorAll('.pt-q').forEach((el) => el.classList.remove('pt-q-invalid'));
  form.querySelectorAll('.field-error').forEach((el) => (el.textContent = ''));
  let first = null;
  for (const [qid, m] of Object.entries(errors || {})) {
    const card = form.querySelector(`[data-q="${qid}"]`);
    if (!card) continue;
    card.classList.add('pt-q-invalid');
    card.querySelector('.field-error').textContent = m;
    first ||= card;
  }
  if (first) {
    first.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    first.querySelector('input, textarea')?.focus({ preventScroll: true });
  }
}

function merciHtml(q) {
  const r = q.reponse || {};
  const score = r.score_max
    ? html`<p class="pt-score">Votre score : <strong>${Number(r.score)} / ${Number(r.score_max)}</strong></p>`
    : '';
  return html`<section class="card pt-merci" role="status">
    <div class="pt-merci-icon" aria-hidden="true">✔</div>
    <h2>Merci pour vos réponses !</h2>
    <p class="muted">Envoyées le ${fmtDate(r.submitted_at)}.</p>
    ${raw(score)}
    <a class="btn btn-primary pt-btn-block" href="#">Retour à l’accueil</a>
  </section>`;
}

function questionnaireShell(q, inner) {
  return html`<div class="pt-shell">
    ${raw(header())}
    <main>
      <a class="btn btn-ghost pt-back" href="#">← Retour</a>
      <h1>${q ? q.titre : 'Questionnaire'}</h1>
      ${q ? raw(html`<p class="muted">${MOMENT[q.moment] || ''}</p>`) : ''}
      ${raw(inner)}
    </main>
  </div>`;
}

async function renderQuestionnaire(id) {
  window.scrollTo(0, 0);
  app.innerHTML = questionnaireShell(null, html`<p class="loader" role="status">Chargement…</p>`);
  let q;
  try {
    q = await papi('GET', `/portail/questionnaires/${id}`);
  } catch (err) {
    if (handleAuthError(err)) return;
    app.innerHTML = questionnaireShell(null, html`<div class="alert alert-error" role="alert">${err.message}</div>`);
    return;
  }
  setTitle(q.titre);
  if (q.reponse) {
    app.innerHTML = questionnaireShell(q, merciHtml(q));
    return;
  }
  if (!q.ouvert) {
    app.innerHTML = questionnaireShell(q, html`<div class="alert alert-info">Ce questionnaire est fermé.</div>`);
    return;
  }
  const questions = q.questions || [];
  app.innerHTML = questionnaireShell(
    q,
    html`<p class="muted pt-help">Les questions marquées d’un <span class="req">*</span> sont obligatoires.</p>
    <form novalidate class="pt-form">
      ${raw(questions.map(questionHtml).join(''))}
      <div class="pt-form-msg" aria-live="assertive"></div>
      <button type="submit" class="btn btn-primary pt-btn-block">Envoyer mes réponses</button>
    </form>`,
  );
  const form = app.querySelector('form');
  const msg = form.querySelector('.pt-form-msg');
  form.addEventListener('change', (e) => {
    const card = e.target.closest('.pt-q');
    if (card?.classList.contains('pt-q-invalid')) {
      card.classList.remove('pt-q-invalid');
      card.querySelector('.field-error').textContent = '';
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const answers = readAnswers(form, questions);
    const errors = validateAnswers(questions, answers);
    if (Object.keys(errors).length) {
      msg.innerHTML = html`<div class="alert alert-error">Merci de répondre à toutes les questions obligatoires.</div>`;
      showErrors(form, errors);
      return;
    }
    msg.innerHTML = '';
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const res = await papi('POST', `/portail/questionnaires/${q.id}`, { answers: compactAnswers(answers) });
      const item = moi?.questionnaires?.find((x) => String(x.id) === String(q.id));
      if (item) item.submitted_at = res.reponse?.submitted_at || new Date().toISOString();
      app.innerHTML = questionnaireShell(res, merciHtml(res));
      window.scrollTo(0, 0);
    } catch (err) {
      if (handleAuthError(err)) return;
      btn.disabled = false;
      msg.innerHTML = html`<div class="alert alert-error">${err.message}</div>`;
      if (err.fields && Object.keys(err.fields).length) showErrors(form, err.fields);
      else toastError(err);
    }
  });
}

/* ---------- Démarrage ---------- */

function boot() {
  const fromHash = tokenFromHash(location.hash);
  if (fromHash) {
    saveToken(fromHash);
    history.replaceState(null, '', location.pathname + location.search);
  } else {
    token = loadToken();
  }
  if (!token) return renderLogin();
  // Au chargement, repartir de l'accueil si l'URL pointe vers un questionnaire : start() gère la route.
  start();
}

boot();
