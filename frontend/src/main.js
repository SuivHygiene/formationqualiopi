import './styles.css';
import { get, post, setCsrf } from './api.js';
import { $, $$, html, raw, toastError, formFields, readForm, showFieldErrors } from './ui.js';
import { ROLE } from './labels.js';
import { state } from './state.js';
import { renderDashboard } from './views/dashboard.js';
import { renderSessions, renderSession } from './views/sessions.js';
import { renderResource } from './views/resources.js';
import { renderQuestionnaires, renderQuestionnaire } from './views/questionnaires.js';
import { renderRegistre } from './views/registre.js';
import { renderQualiopi } from './views/qualiopi.js';
import { renderParametres } from './views/parametres.js';
import { renderEmargementTablette } from './views/tablette.js';

const NAV = [
  { group: 'Pilotage' },
  { path: 'tableau-de-bord', label: 'Tableau de bord' },
  { path: 'sessions', label: 'Sessions' },
  { group: 'Référentiels' },
  { path: 'formations', label: 'Catalogue de formations', roles: ['admin', 'gestionnaire'] },
  { path: 'clients', label: 'Entreprises clientes', roles: ['admin', 'gestionnaire'] },
  { path: 'stagiaires', label: 'Stagiaires', roles: ['admin', 'gestionnaire'] },
  { path: 'formateurs', label: 'Formateurs', roles: ['admin', 'gestionnaire'] },
  { path: 'questionnaires', label: 'Questionnaires', roles: ['admin', 'gestionnaire'] },
  { group: 'Qualiopi' },
  { path: 'qualiopi', label: 'Suivi des preuves', roles: ['admin', 'gestionnaire'] },
  { path: 'registre', label: 'Registres', roles: ['admin', 'gestionnaire'] },
  { group: 'Compte' },
  { path: 'parametres', label: 'Paramètres' },
];

const ROUTES = [
  [/^tableau-de-bord$/, () => renderDashboard],
  [/^sessions$/, () => renderSessions],
  [/^sessions\/(\d+)(?:\/(\w+))?$/, (m) => (el) => renderSession(el, +m[1], m[2])],
  [/^emargement\/(\d+)$/, (m) => (el) => renderEmargementTablette(el, +m[1])],
  [/^(formations|clients|stagiaires|formateurs)$/, (m) => (el) => renderResource(el, m[1])],
  [/^questionnaires$/, () => renderQuestionnaires],
  [/^questionnaires\/(\d+|nouveau)$/, (m) => (el) => renderQuestionnaire(el, m[1])],
  [/^registre(?:\/(\w+))?$/, (m) => (el) => renderRegistre(el, m[1] || 'veille')],
  [/^qualiopi$/, () => renderQualiopi],
  [/^parametres(?:\/(\w+))?$/, (m) => (el) => renderParametres(el, m[1] || 'organisme')],
];

async function boot() {
  try {
    const me = await get('/auth/me');
    if (!me.user) return renderLogin(me.signup);
    setSession(me);
    renderShell();
    route();
  } catch (e) {
    $('#app').innerHTML = html`<div class="loader">Impossible de joindre le serveur : ${e.message}</div>`;
  }
}

function setSession(me) {
  state.user = me.user;
  state.organisme = me.organisme;
  setCsrf(me.csrf);
  if (me.organisme?.couleur) document.documentElement.style.setProperty('--primary', me.organisme.couleur);
}

function renderLogin(signupEnabled, mode = 'login') {
  const loginFields = [
    { name: 'email', label: 'E-mail', type: 'email', required: true, full: true },
    { name: 'password', label: 'Mot de passe', type: 'password', required: true, full: true },
  ];
  const signupFields = [
    { name: 'organisme', label: "Nom de l'organisme de formation", required: true, full: true },
    { name: 'prenom', label: 'Prénom', required: true },
    { name: 'nom', label: 'Nom', required: true },
    { name: 'email', label: 'E-mail', type: 'email', required: true, full: true },
    { name: 'password', label: 'Mot de passe (10 caractères min.)', type: 'password', required: true, full: true },
  ];
  const fields = mode === 'login' ? loginFields : signupFields;
  $('#app').innerHTML = html`<div class="auth-page"><div class="auth-card">
    <h1>Suiv'Formation</h1>
    <p class="sub">${mode === 'login' ? 'Gestion de formation & Qualiopi' : 'Créer un espace organisme'}</p>
    <form class="form-grid" novalidate>${raw(formFields(fields))}
      <button class="btn btn-primary full" type="submit" style="justify-content:center">${mode === 'login' ? 'Se connecter' : 'Créer mon espace'}</button>
    </form>
    ${signupEnabled ? raw(html`<p class="sub" style="margin-top:16px"><a href="#" data-switch>${mode === 'login' ? 'Créer un espace organisme' : "J'ai déjà un compte"}</a></p>`) : ''}
  </div></div>`;
  const form = $('.auth-card form');
  $('[data-switch]')?.addEventListener('click', (e) => {
    e.preventDefault();
    renderLogin(signupEnabled, mode === 'login' ? 'signup' : 'login');
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const me = await post(mode === 'login' ? '/auth/login' : '/auth/signup', readForm(form, fields));
      setSession(me);
      renderShell();
      if (!location.hash) location.hash = '#/tableau-de-bord';
      route();
    } catch (err) {
      showFieldErrors(form, err);
      toastError(err);
    } finally {
      btn.disabled = false;
    }
  });
}

function renderShell() {
  const u = state.user;
  const org = state.organisme;
  const items = NAV.filter((n) => !n.roles || n.roles.includes(u.role));
  $('#app').innerHTML = html`<div class="topbar"><button type="button" data-menu aria-label="Menu">☰</button><strong>${org.nom}</strong></div>
  <div class="layout">
    <nav class="sidebar" aria-label="Navigation principale">
      <div class="brand">${org.logo ? raw(html`<img src="${org.logo}" alt="">`) : ''}<span>${org.nom}</span></div>
      ${raw(items.map((n) => (n.group ? html`<div class="nav-group">${n.group}</div>` : html`<a class="nav" href="#/${n.path}" data-nav="${n.path}">${n.label}</a>`)).join(''))}
      <div class="user-box">${u.prenom} ${u.nom}<br><small style="color:#fff;opacity:.7">${ROLE[u.role]}</small><br><button type="button" data-logout>Se déconnecter</button></div>
    </nav>
    <main class="main" id="view" tabindex="-1"></main>
  </div>`;
  $('[data-menu]').addEventListener('click', () => $('.sidebar').classList.toggle('open'));
  $('.sidebar').addEventListener('click', (e) => {
    if (e.target.closest('a')) $('.sidebar').classList.remove('open');
  });
  $('[data-logout]').addEventListener('click', async () => {
    try {
      await post('/auth/logout');
    } catch {
      /* déjà déconnecté */
    }
    location.hash = '';
    location.reload();
  });
}

let routeToken = 0;
async function route() {
  if (!state.user) return;
  const path = location.hash.replace(/^#\/?/, '').split('?')[0] || 'tableau-de-bord';
  const view = $('#view');
  if (!view) return;
  const top = path.split('/')[0];
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === top || (top === 'emargement' && a.dataset.nav === 'sessions')));
  // Changer de page ferme les fenêtres encore ouvertes.
  $$('.modal-backdrop').forEach((m) => m.remove());
  document.body.classList.remove('no-scroll');
  const token = ++routeToken;
  for (const [re, factory] of ROUTES) {
    const m = path.match(re);
    if (m) {
      view.innerHTML = '<div class="loader">Chargement…</div>';
      try {
        await factory(m)(view, () => token === routeToken);
      } catch (e) {
        if (token === routeToken) view.innerHTML = html`<div class="alert alert-error">${e.message}</div>`;
      }
      document.title = `${$('#view h1')?.textContent || "Suiv'Formation"} · Suiv'Formation`;
      return;
    }
  }
  view.innerHTML = html`<div class="empty"><p>Page introuvable.</p><a class="btn" href="#/tableau-de-bord">Retour</a></div>`;
}

window.addEventListener('hashchange', route);
// Lignes cliquables : <tr data-href="#/…">
document.addEventListener('click', (e) => {
  const row = e.target.closest('[data-href]');
  if (row && !e.target.closest('a, button, input, select, textarea')) location.hash = row.dataset.href;
});
window.addEventListener('sf:unauthorized', () => {
  state.user = null;
  renderLogin(false);
});
window.addEventListener('sf:refresh-org', (e) => {
  state.organisme = { ...state.organisme, ...e.detail };
  renderShell();
  route();
});

boot();
