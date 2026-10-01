// Paramètres : organisme, utilisateurs, mot de passe.
import { get, post, put } from '../api.js';
import { html, raw, $, $$, badge, formFields, bindImageFields, readForm, showFieldErrors, formModal, toast, toastError, fmtDateTime } from '../ui.js';
import { ROLE, opts } from '../labels.js';
import { state, isAdmin } from '../state.js';

const ORG_FIELDS = [
  { section: 'Identité' },
  { name: 'nom', label: "Nom de l'organisme", required: true, full: true },
  { name: 'siret', label: 'SIRET' },
  { name: 'nda', label: "N° de déclaration d'activité" },
  { name: 'qualiopi_numero', label: 'N° de certificat Qualiopi' },
  { name: 'qualiopi_certificateur', label: 'Organisme certificateur' },
  { name: 'adresse', label: 'Adresse', full: true },
  { name: 'code_postal', label: 'Code postal' },
  { name: 'ville', label: 'Ville' },
  { name: 'email', label: 'E-mail', type: 'email' },
  { name: 'telephone', label: 'Téléphone', type: 'tel' },
  { name: 'site_web', label: 'Site web' },
  { section: 'Représentant légal (signataire des documents)' },
  { name: 'representant_nom', label: 'Nom et prénom' },
  { name: 'representant_qualite', label: 'Qualité', placeholder: 'Gérant, Président…' },
  { name: 'signature_cachet', label: 'Signature et cachet (image)', type: 'image', full: true },
  { section: 'Référent handicap' },
  { name: 'referent_handicap_nom', label: 'Nom' },
  { name: 'referent_handicap_email', label: 'E-mail', type: 'email' },
  { name: 'referent_handicap_tel', label: 'Téléphone', type: 'tel' },
  { section: 'Apparence et documents' },
  { name: 'logo', label: 'Logo', type: 'image', full: true },
  { name: 'couleur', label: "Couleur principale", type: 'color', default: '#1f3a68' },
  { name: 'mentions_documents', label: 'Mentions en pied de document', type: 'textarea', rows: 2 },
  { name: 'conditions_generales', label: 'Conditions générales (annexées aux conventions)', type: 'textarea', rows: 8 },
];

export async function renderParametres(el, tab, alive = () => true) {
  const tabs = [['organisme', 'Organisme'], ...(isAdmin() ? [['utilisateurs', 'Utilisateurs']] : []), ['compte', 'Mon compte']];
  if (!tabs.some(([k]) => k === tab)) tab = tabs[0][0];
  el.innerHTML = html`<div class="page-head"><div><h1>Paramètres</h1></div></div>
    <div class="tabs">${raw(tabs.map(([k, l]) => html`<button class="${k === tab ? 'active' : ''}" data-t="${k}">${l}</button>`).join(''))}</div><div data-body></div>`;
  $$('[data-t]', el).forEach((b) => b.addEventListener('click', () => (location.hash = `#/parametres/${b.dataset.t}`)));
  const body = $('[data-body]', el);
  if (tab === 'organisme') await tabOrganisme(body, alive);
  if (tab === 'utilisateurs') await tabUsers(body, alive);
  if (tab === 'compte') tabCompte(body);
}

async function tabOrganisme(body, alive) {
  const o = await get('/organisme');
  if (!alive()) return;
  const readonly = !isAdmin();
  body.innerHTML = html`<form class="card form-grid" novalidate ${readonly ? raw('inert') : ''}>${raw(formFields(ORG_FIELDS, o))}
    ${readonly ? raw('<p class="full muted">Seul un administrateur peut modifier ces informations.</p>') : raw('<div class="form-actions full"><button class="btn btn-primary" type="submit">Enregistrer</button></div>')}</form>`;
  const form = $('form', body);
  bindImageFields(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const saved = await put('/organisme', readForm(form, ORG_FIELDS));
      showFieldErrors(form, {});
      toast('Organisme enregistré', 'success');
      window.dispatchEvent(new CustomEvent('sf:refresh-org', { detail: { nom: saved.nom, logo: saved.logo, couleur: saved.couleur } }));
      if (saved.couleur) document.documentElement.style.setProperty('--primary', saved.couleur);
    } catch (err) {
      showFieldErrors(form, err);
      toastError(err);
    }
  });
}

async function tabUsers(body, alive) {
  const [users, formateurs] = await Promise.all([get('/users'), get('/formateurs')]);
  if (!alive()) return;
  const fOpts = [['', '—'], ...formateurs.map((f) => [f.id, `${f.prenom} ${f.nom}`])];
  body.innerHTML = html`<div class="card"><div class="card-head"><h2>Utilisateurs</h2><button class="btn btn-primary" data-new>+ Inviter</button></div>
    <p class="muted"><strong>Administrateur</strong> : tout, y compris paramètres et utilisateurs. <strong>Gestionnaire</strong> : sessions, référentiels, documents. <strong>Formateur</strong> : uniquement ses sessions (émargement, évaluations) ; associez-le à sa fiche formateur.</p>
    <table class="table"><thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Dernière connexion</th><th></th></tr></thead><tbody>
    ${raw(users.map((u) => html`<tr class="clickable" data-id="${u.id}"><td>${u.prenom} ${u.nom}</td><td>${u.email}</td><td>${ROLE[u.role]}</td><td>${u.last_login_at ? fmtDateTime(u.last_login_at) : '—'}</td><td>${u.actif ? '' : raw(badge('Désactivé', 'red'))}</td></tr>`).join(''))}
    </tbody></table></div>`;
  const reload = () => tabUsers(body, alive);
  $('[data-new]', body).addEventListener('click', () => formModal({
    title: 'Nouvel utilisateur',
    fields: [
      { name: 'prenom', label: 'Prénom', required: true },
      { name: 'nom', label: 'Nom', required: true },
      { name: 'email', label: 'E-mail', type: 'email', required: true, full: true },
      { name: 'role', label: 'Rôle', type: 'select', options: opts(ROLE), default: 'gestionnaire' },
      { name: 'formateur_id', label: 'Fiche formateur liée', type: 'select', options: fOpts },
      { name: 'password', label: 'Mot de passe provisoire (10 caractères min.)', type: 'text', required: true, full: true, help: 'Transmettez-le de façon sûre ; la personne le changera dans « Mon compte ».' },
    ],
    onSubmit: async (v) => { await post('/users', v); toast('Utilisateur créé', 'success'); reload(); },
  }));
  $$('tr[data-id]', body).forEach((tr) => tr.addEventListener('click', () => {
    const u = users.find((x) => String(x.id) === tr.dataset.id);
    formModal({
      title: `${u.prenom} ${u.nom}`,
      fields: [
        { name: 'prenom', label: 'Prénom' },
        { name: 'nom', label: 'Nom' },
        { name: 'email', label: 'E-mail de connexion', type: 'email', full: true },
        { name: 'role', label: 'Rôle', type: 'select', options: opts(ROLE) },
        { name: 'formateur_id', label: 'Fiche formateur liée', type: 'select', options: fOpts },
        { name: 'password', label: 'Nouveau mot de passe (laisser vide pour ne pas changer)', type: 'text', full: true },
        { name: 'actif', label: 'Compte actif', type: 'checkbox' },
      ],
      values: { ...u, password: '' },
      onSubmit: async (v) => {
        if (!v.password) delete v.password;
        await put(`/users/${u.id}`, v);
        toast('Enregistré', 'success');
        reload();
      },
    });
  }));
}

function tabCompte(body) {
  const fields = [
    { name: 'current', label: 'Mot de passe actuel', type: 'password', required: true, full: true },
    { name: 'password', label: 'Nouveau mot de passe (10 caractères min.)', type: 'password', required: true, full: true },
  ];
  const emailFields = [
    { name: 'email', label: 'Nouvel e-mail de connexion', type: 'email', required: true, full: true },
    { name: 'current', label: 'Mot de passe actuel (confirmation)', type: 'password', required: true, full: true },
  ];
  body.innerHTML = html`<form class="card form-grid" style="max-width:520px" novalidate data-email><h2 class="full">E-mail de connexion</h2>
    <p class="full">Actuellement : <strong data-current-email>${state.user.email}</strong></p>${raw(formFields(emailFields))}
    <div class="form-actions full"><button class="btn btn-primary" type="submit">Changer l'e-mail</button></div></form>
    <form class="card form-grid" style="max-width:520px" novalidate data-password><h2 class="full">Mot de passe</h2>${raw(formFields(fields).replaceAll('id="f_current"', 'id="f_current_pw"').replaceAll('for="f_current"', 'for="f_current_pw"'))}
    <div class="form-actions full"><button class="btn btn-primary" type="submit">Changer le mot de passe</button></div></form>`;
  const emailForm = $('[data-email]', body);
  emailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const me = await post('/auth/email', readForm(emailForm, emailFields));
      state.user = me.user;
      $('[data-current-email]', body).textContent = me.user.email;
      emailForm.reset();
      showFieldErrors(emailForm, {});
      toast('E-mail modifié : utilisez-le à la prochaine connexion', 'success');
    } catch (err) {
      showFieldErrors(emailForm, err);
      toastError(err);
    }
  });
  const form = $('[data-password]', body);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await post('/auth/password', readForm(form, fields));
      form.reset();
      showFieldErrors(form, {});
      toast('Mot de passe modifié', 'success');
    } catch (err) {
      showFieldErrors(form, err);
      toastError(err);
    }
  });
}
