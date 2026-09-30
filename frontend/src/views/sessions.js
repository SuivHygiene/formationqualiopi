// Sessions : liste, création, fiche complète (planning, stagiaires, émargement, questionnaires, documents).
import { get, post, put, del } from '../api.js';
import {
  html, raw, esc, $, $$, badge, emptyState, formModal, openModal, confirmDialog, toast, toastError, debounce,
  fmtDate, fmtDateLong, fmtDateTime, fmtHeure, fmtNum, fmtEuro,
} from '../ui.js';
import {
  STATUT_SESSION, MODALITE, TYPE_SESSION, TYPE_QUESTIONNAIRE, MOMENT, TYPE_DOCUMENT, STATUT_INSCRIPTION, opts,
} from '../labels.js';
import { canWrite } from '../state.js';
import { qrDataUrl, portailUrl, portailBaseUrl } from '../qr.js';
import { signaturePad } from '../signature.js';
import { groupByDay, periodeLabel, generateCreneaux } from './planning.js';

async function refs() {
  const [formations, clients, formateurs] = await Promise.all([get('/formations?actif=1'), get('/clients'), get('/formateurs?actif=1')]);
  return { formations, clients, formateurs };
}

function sessionFields({ formations, clients, formateurs }, isNew) {
  return [
    { name: 'formation_id', label: 'Formation du catalogue', type: 'select', required: true, full: true,
      options: [['', '— Choisir —'], ...formations.map((f) => [f.id, f.titre])] },
    { name: 'intitule', label: 'Intitulé affiché (si différent)', full: true, help: isNew ? 'Laissez vide pour reprendre le titre de la formation.' : '' },
    { name: 'type', label: 'Type', type: 'select', options: opts(TYPE_SESSION) },
    { name: 'client_id', label: 'Entreprise cliente', type: 'select', options: [['', '— Aucune / inter —'], ...clients.map((c) => [c.id, c.raison_sociale])] },
    { name: 'formateur_id', label: 'Formateur', type: 'select', options: [['', '— À définir —'], ...formateurs.map((f) => [f.id, `${f.prenom} ${f.nom}`])] },
    { name: 'modalite', label: 'Modalité', type: 'select', options: [['', 'Comme la formation'], ...opts(MODALITE)] },
    { name: 'lieu', label: 'Lieu', full: true, placeholder: 'Adresse, salle ou lien de visio' },
    { name: 'prix_ht', label: 'Prix total HT (€)', type: 'number', step: '0.01' },
    { name: 'financement', label: 'Financement', placeholder: 'OPCO, entreprise, CPF, personnel…' },
    { name: 'duree_heures', label: 'Durée prévue (h)', type: 'number', step: '0.5', help: isNew ? 'Par défaut : durée de la formation.' : '' },
    { name: 'statut', label: 'Statut', type: 'select', options: opts(STATUT_SESSION), default: 'planifiee' },
    { name: 'reference', label: 'Référence', help: isNew ? 'Générée automatiquement si vide.' : '' },
    { name: 'notes', label: 'Notes internes', type: 'textarea' },
  ];
}

// ───────────────────────────── Liste ─────────────────────────────

export async function renderSessions(el, alive = () => true) {
  const filters = { statut: '', q: '', annee: '' };
  el.innerHTML = html`<div class="page-head"><div><h1>Sessions</h1><p class="muted">Planifiez, émargez, évaluez, éditez les documents.</p></div>
    <div class="actions">${canWrite() ? raw('<button class="btn btn-primary" data-new>+ Nouvelle session</button>') : ''}</div></div>
    <div class="card">
      <div class="toolbar">
        <input type="search" placeholder="Intitulé, référence, client…" aria-label="Rechercher" data-search>
        <select data-annee aria-label="Année"><option value="">Toutes les années</option>${raw(years().map((y) => `<option>${y}</option>`).join(''))}</select>
        <div class="chips">${raw([['', 'Toutes'], ...opts(STATUT_SESSION)].map(([k, l]) => html`<button class="chip ${k === '' ? 'active' : ''}" data-statut="${k}">${l}</button>`).join(''))}</div>
      </div>
      <div data-list></div>
    </div>`;

  const load = async () => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    const rows = await get('/sessions' + (qs ? '?' + qs : ''));
    if (!alive()) return;
    $('[data-list]', el).innerHTML = rows.length
      ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Session</th><th>Dates</th><th>Client</th><th>Formateur</th><th>Inscrits</th><th>Statut</th></tr></thead><tbody>
        ${raw(rows.map((s) => html`<tr class="clickable" data-href="#/sessions/${s.id}">
          <td><strong>${s.intitule}</strong><br><small>${s.reference || ''} · ${MODALITE[s.modalite]}${s.lieu ? ' · ' + s.lieu : ''}</small></td>
          <td>${s.date_debut ? fmtDate(s.date_debut) : raw('<small>Non planifiée</small>')}${s.date_fin && s.date_fin !== s.date_debut ? raw('<br><small>→ ' + esc(fmtDate(s.date_fin)) + '</small>') : ''}</td>
          <td>${s.client_nom || raw('<small>Inter / particuliers</small>')}</td>
          <td>${s.formateur_nom || ''}</td>
          <td>${s.nb_inscrits}</td>
          <td>${raw(badge(...STATUT_SESSION[s.statut]))}</td></tr>`).join(''))}</tbody></table></div>`
      : emptyState('Aucune session.', canWrite() ? '<button class="btn btn-primary" data-new2>Créer la première session</button>' : '');
    $('[data-new2]', el)?.addEventListener('click', () => createSession());
  };

  $('[data-new]', el)?.addEventListener('click', () => createSession());
  $('[data-search]', el).addEventListener('input', debounce((e) => { filters.q = e.target.value.trim(); load().catch(toastError); }));
  $('[data-annee]', el).addEventListener('change', (e) => { filters.annee = e.target.value; load().catch(toastError); });
  $$('[data-statut]', el).forEach((b) => b.addEventListener('click', () => {
    $$('[data-statut]', el).forEach((x) => x.classList.toggle('active', x === b));
    filters.statut = b.dataset.statut;
    load().catch(toastError);
  }));
  await load();
  if (location.hash.includes('nouvelle=1') && canWrite()) {
    history.replaceState(null, '', '#/sessions');
    createSession();
  }
}

function years() {
  const y = new Date().getFullYear();
  return [y + 1, y, y - 1, y - 2, y - 3];
}

async function createSession() {
  const r = await refs();
  if (!r.formations.length) {
    toast("Ajoutez d'abord une formation au catalogue.", 'error');
    location.hash = '#/formations';
    return;
  }
  formModal({
    title: 'Nouvelle session',
    wide: true,
    fields: sessionFields(r, true),
    submitLabel: 'Créer la session',
    onSubmit: async (v) => {
      const s = await post('/sessions', v);
      toast('Session créée — ajoutez maintenant le planning.', 'success');
      location.hash = `#/sessions/${s.id}/planning`;
    },
  });
}

// ───────────────────────────── Fiche session ─────────────────────────────

const TABS = [
  ['resume', 'Résumé'],
  ['planning', 'Planning'],
  ['stagiaires', 'Stagiaires'],
  ['emargement', 'Émargement'],
  ['questionnaires', 'Évaluations'],
  ['documents', 'Documents'],
];

export async function renderSession(el, id, tab = 'resume', alive = () => true) {
  if (!TABS.some(([k]) => k === tab)) tab = 'resume';
  let s = await get(`/sessions/${id}`);
  if (!alive()) return;

  const draw = () => {
    const inscrits = s.inscriptions.filter((i) => i.statut === 'inscrit').length;
    el.innerHTML = html`<div class="page-head"><div>
        <a href="#/sessions" class="muted">← Sessions</a>
        <h1>${s.intitule}</h1>
        <p class="muted">${s.reference} · ${s.date_debut ? fmtDate(s.date_debut) + (s.date_fin !== s.date_debut ? ' → ' + fmtDate(s.date_fin) : '') : 'dates à planifier'}
          · ${inscrits} inscrit(s) · ${raw(badge(...STATUT_SESSION[s.statut]))}</p></div>
        <div class="actions">
          <button class="btn" data-qr-salle title="QR code à projeter en salle">QR de salle</button>
          <a class="btn btn-primary" href="#/emargement/${s.id}">Émargement tablette</a>
        </div></div>
      <div class="tabs" role="tablist">${raw(TABS.map(([k, l]) => html`<button role="tab" class="${k === tab ? 'active' : ''}" data-tab="${k}">${l}</button>`).join(''))}</div>
      <div data-tab-body></div>`;
    $$('[data-tab]', el).forEach((b) => b.addEventListener('click', () => {
      tab = b.dataset.tab;
      history.replaceState(null, '', `#/sessions/${id}/${tab}`);
      draw();
    }));
    $('[data-qr-salle]', el).addEventListener('click', () => showQrSalle(s));
    const body = $('[data-tab-body]', el);
    const ctx = { s, id, reload, body };
    ({ resume: tabResume, planning: tabPlanning, stagiaires: tabStagiaires, emargement: tabEmargement, questionnaires: tabQuestionnaires, documents: tabDocuments })[tab](ctx);
  };

  async function reload(next) {
    s = next || (await get(`/sessions/${id}`));
    draw();
  }
  draw();
}

async function showQrSalle(s) {
  const url = `${portailBaseUrl()}?s=${s.code_public}`;
  const img = await qrDataUrl(url, 420);
  openModal({
    title: 'Accès stagiaires — à projeter',
    content: html`<div style="text-align:center">
      <img src="${img}" alt="QR code d'accès" style="width:min(420px,100%)">
      <p>Scannez puis saisissez votre <strong>code personnel</strong> (sur votre convocation).</p>
      <p>Code session : <span class="kbd-code" style="font-size:2rem">${s.code_public}</span></p>
      <p class="muted">${url}</p></div>`,
  });
}

// ── Résumé
function tabResume({ s, reload, body }) {
  const f = s.formation;
  body.innerHTML = html`<div class="grid grid-2">
    <div class="card"><div class="card-head"><h2>Informations</h2>${canWrite() ? raw('<button class="btn btn-small" data-edit>Modifier</button>') : ''}</div>
      <dl class="info">
        <dt>Formation</dt><dd>${f.titre}</dd>
        <dt>Type</dt><dd>${TYPE_SESSION[s.type]}</dd>
        <dt>Modalité</dt><dd>${MODALITE[s.modalite]}</dd>
        <dt>Lieu</dt><dd>${s.lieu || '—'}</dd>
        <dt>Client</dt><dd>${s.client?.raison_sociale || 'Inter / particuliers'}</dd>
        <dt>Formateur</dt><dd>${s.formateur ? `${s.formateur.prenom} ${s.formateur.nom}` : '—'}</dd>
        <dt>Durée prévue</dt><dd>${s.duree_heures ? fmtNum(s.duree_heures) + ' h' : '—'} (planning : ${fmtNum(s.heures_planifiees)} h)</dd>
        <dt>Prix HT</dt><dd>${s.prix_ht ? fmtEuro(s.prix_ht) : '—'}</dd>
        <dt>Financement</dt><dd>${s.financement || '—'}</dd>
        <dt>Code session</dt><dd><span class="kbd-code">${s.code_public}</span></dd>
        <dt>Notes</dt><dd>${s.notes || '—'}</dd>
      </dl>
      ${s.duree_heures && Math.abs(s.duree_heures - s.heures_planifiees) > 0.01 && s.creneaux.length
        ? raw(html`<div class="alert alert-warn" style="margin-top:12px">Le planning (${fmtNum(s.heures_planifiees)} h) ne correspond pas à la durée prévue (${fmtNum(s.duree_heures)} h).</div>`) : ''}
    </div>
    <div class="card"><h2>Avancement</h2>${raw(checklist(s))}</div>
  </div>
  ${canWrite() ? raw('<div class="form-actions" style="justify-content:flex-start"><button class="btn btn-ghost" data-delete style="color:var(--red)">Supprimer la session</button></div>') : ''}`;

  $('[data-edit]', body)?.addEventListener('click', async () => {
    const r = await refs();
    if (!r.formations.some((x) => x.id === s.formation_id)) r.formations.push(s.formation);
    formModal({ title: 'Modifier la session', wide: true, fields: sessionFields(r, false), values: s,
      onSubmit: async (v) => { await reload(await put(`/sessions/${s.id}`, v)); toast('Enregistré', 'success'); } });
  });
  $('[data-delete]', body)?.addEventListener('click', async () => {
    if (!(await confirmDialog('Supprimer cette session ? Les sessions contenant des preuves (émargements, documents) ne peuvent pas être supprimées : passez-les en « annulée ».', { ok: 'Supprimer', danger: true }))) return;
    try {
      await del(`/sessions/${s.id}`);
      toast('Session supprimée', 'success');
      location.hash = '#/sessions';
    } catch (e) {
      toastError(e);
    }
  });
}

function checklist(s) {
  const inscrits = s.inscriptions.filter((i) => i.statut === 'inscrit');
  const docs = (t) => s.documents.filter((d) => d.type === t).length;
  const hasQ = (type) => s.questionnaires.some((q) => q.type === type);
  const today = new Date().toISOString().slice(0, 10);
  const passes = s.creneaux.filter((c) => c.date < today);
  const attendus = passes.length * inscrits.length;
  const faits = s.emargements.filter((e) => passes.some((c) => c.id === e.creneau_id) && inscrits.some((i) => i.id === e.inscription_id)).length;
  const items = [
    [s.creneaux.length > 0, 'Planning saisi', 'planning'],
    [inscrits.length > 0, 'Stagiaires inscrits', 'stagiaires'],
    [docs('convention') > 0 || !s.client_id, s.client_id ? 'Convention émise' : 'Convention (sans client : contrat individuel conseillé)', 'documents'],
    [inscrits.length > 0 && docs('convocation') >= inscrits.length, 'Convocations émises', 'documents'],
    [hasQ('positionnement'), 'Recueil des besoins / positionnement', 'questionnaires'],
    [hasQ('evaluation_acquis'), 'Évaluation des acquis', 'questionnaires'],
    [attendus === 0 || faits >= attendus, attendus ? `Émargements des créneaux passés (${faits}/${attendus})` : 'Émargements', 'emargement'],
    [hasQ('satisfaction_chaud'), 'Satisfaction à chaud', 'questionnaires'],
    [inscrits.length > 0 && docs('certificat_realisation') + docs('attestation') >= inscrits.length, 'Attestations / certificats émis', 'documents'],
    [hasQ('satisfaction_froid'), 'Évaluation à froid', 'questionnaires'],
  ];
  return html`<ul style="list-style:none;padding:0;margin:0">${raw(items.map(([ok, label, tab]) => html`<li style="padding:6px 0;border-bottom:1px solid var(--line)">
    ${ok ? '✅' : '⬜'} <a href="#/sessions/${s.id}/${tab}">${label}</a></li>`).join(''))}</ul>`;
}

// ── Planning
function tabPlanning({ s, reload, body }) {
  let rows = s.creneaux.map((c) => ({ id: c.id, date: c.date, heure_debut: c.heure_debut.slice(0, 5), heure_fin: c.heure_fin.slice(0, 5) }));
  const signedIds = new Set(s.emargements.map((e) => e.creneau_id));

  const draw = () => {
    const total = rows.reduce((h, r) => h + Math.max(0, (toMin(r.heure_fin) - toMin(r.heure_debut)) / 60), 0);
    body.innerHTML = html`<div class="card">
      <div class="card-head"><h2>Créneaux à émarger</h2><span class="muted">Total : ${fmtNum(total)} h</span></div>
      <p class="muted">Un créneau = une demi-journée (ou une séquence) que chaque stagiaire signe. Les dates de la session sont calculées à partir du planning.</p>
      ${canWrite() ? raw(html`<div class="toolbar">
        <label>Du <input type="date" data-g-from style="width:auto"></label>
        <label>au <input type="date" data-g-to style="width:auto"></label>
        <label>Matin <input type="time" data-g-m1 value="09:00" style="width:auto"> – <input type="time" data-g-m2 value="12:30" style="width:auto"></label>
        <label>Après-midi <input type="time" data-g-a1 value="13:30" style="width:auto"> – <input type="time" data-g-a2 value="17:00" style="width:auto"></label>
        <label><input type="checkbox" data-g-we> week-ends</label>
        <button class="btn" data-generate>Générer</button></div>`) : ''}
      <div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Début</th><th>Fin</th><th>Durée</th><th></th></tr></thead><tbody>
      ${raw(rows.map((r, i) => html`<tr>
        <td><input type="date" value="${r.date}" data-i="${i}" data-k="date" ${canWrite() ? '' : raw('disabled')}></td>
        <td><input type="time" value="${r.heure_debut}" data-i="${i}" data-k="heure_debut" ${canWrite() ? '' : raw('disabled')}></td>
        <td><input type="time" value="${r.heure_fin}" data-i="${i}" data-k="heure_fin" ${canWrite() ? '' : raw('disabled')}></td>
        <td>${fmtNum(Math.max(0, (toMin(r.heure_fin) - toMin(r.heure_debut)) / 60))} h</td>
        <td class="actions">${canWrite() && !signedIds.has(r.id) ? raw(html`<button class="icon-btn" data-rm="${i}" aria-label="Retirer">✕</button>`) : signedIds.has(r.id) ? raw('<small>émargé</small>') : ''}</td></tr>`).join(''))}
      </tbody></table></div>
      ${!rows.length ? raw(emptyState('Aucun créneau. Utilisez « Générer » ou ajoutez-les un par un.')) : ''}
      ${canWrite() ? raw('<div class="form-actions" style="justify-content:space-between"><button class="btn" data-add>+ Ajouter un créneau</button><button class="btn btn-primary" data-save>Enregistrer le planning</button></div>') : ''}
    </div>`;
    $$('[data-k]', body).forEach((inp) => inp.addEventListener('change', () => {
      rows[+inp.dataset.i][inp.dataset.k] = inp.value;
      draw();
    }));
    $$('[data-rm]', body).forEach((b) => b.addEventListener('click', () => { rows.splice(+b.dataset.rm, 1); draw(); }));
    $('[data-add]', body)?.addEventListener('click', () => {
      const last = rows.at(-1);
      rows.push(last ? { date: last.date, heure_debut: '13:30', heure_fin: '17:00' } : { date: new Date().toISOString().slice(0, 10), heure_debut: '09:00', heure_fin: '12:30' });
      draw();
    });
    $('[data-generate]', body)?.addEventListener('click', () => {
      const from = $('[data-g-from]', body).value;
      const to = $('[data-g-to]', body).value || from;
      if (!from) return toast('Choisissez une date de début', 'error');
      const gen = generateCreneaux(from, to, {
        matin: [$('[data-g-m1]', body).value, $('[data-g-m2]', body).value],
        apresMidi: [$('[data-g-a1]', body).value, $('[data-g-a2]', body).value],
        weekends: $('[data-g-we]', body).checked,
      });
      if (!gen.length) return toast('Aucun jour généré', 'error');
      rows = [...rows, ...gen].sort((a, b) => (a.date + a.heure_debut).localeCompare(b.date + b.heure_debut));
      draw();
      toast(`${gen.length} créneau(x) ajouté(s) — pensez à enregistrer`);
    });
    $('[data-save]', body)?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        await reload(await put(`/sessions/${s.id}/creneaux`, { creneaux: rows }));
        toast('Planning enregistré', 'success');
      } catch (err) {
        toastError(err);
        e.target.disabled = false;
      }
    });
  };
  draw();
}

const toMin = (t) => {
  const [h, m] = String(t || '0:0').split(':').map(Number);
  return h * 60 + (m || 0);
};

// ── Stagiaires
function tabStagiaires({ s, reload, body }) {
  body.innerHTML = html`<div class="card">
    <div class="card-head"><h2>Stagiaires inscrits</h2>${canWrite() ? raw('<div class="actions"><button class="btn" data-add-existing>+ Stagiaire existant</button> <button class="btn btn-primary" data-add-new>+ Nouveau stagiaire</button></div>') : ''}</div>
    ${s.inscriptions.length ? raw(html`<div class="table-wrap"><table class="table"><thead><tr><th>Stagiaire</th><th>Entreprise</th><th>Code personnel</th><th>Financement</th><th>Statut</th><th></th></tr></thead><tbody>
      ${raw(s.inscriptions.map((i) => html`<tr>
        <td><strong>${i.nom.toUpperCase()} ${i.prenom}</strong>${i.besoins_specifiques ? raw(' ' + badge('Besoins spécifiques', 'orange')) : ''}<br><small>${i.email || ''}</small></td>
        <td>${i.entreprise || ''}</td>
        <td><span class="kbd-code">${i.code_acces}</span></td>
        <td>${i.financement || ''}</td>
        <td>${raw(badge(...STATUT_INSCRIPTION[i.statut]))}</td>
        <td class="actions"><button class="btn btn-small" data-acces="${i.id}">Accès portail</button>
          ${canWrite() ? raw(html` <button class="btn btn-small" data-edit="${i.id}">Modifier</button>`) : ''}</td></tr>`).join(''))}
      </tbody></table></div>`) : raw(emptyState('Aucun stagiaire inscrit.'))}
    </div>
    ${s.inscriptions.some((i) => i.besoins_specifiques) ? raw('<div class="alert alert-warn">Des stagiaires ont signalé des besoins spécifiques : vérifiez les adaptations avec votre référent handicap et tracez-les dans le registre « Handicap ».</div>') : ''}`;

  $('[data-add-new]', body)?.addEventListener('click', async () => {
    const clients = await get('/clients');
    formModal({
      title: 'Nouveau stagiaire',
      fields: [
        { name: 'civilite', label: 'Civilité', type: 'select', options: [['', '—'], ['Mme', 'Mme'], ['M.', 'M.']] },
        { name: 'client_id', label: 'Entreprise', type: 'select', options: [['', '—'], ...clients.map((c) => [c.id, c.raison_sociale])], default: s.client_id },
        { name: 'prenom', label: 'Prénom', required: true },
        { name: 'nom', label: 'Nom', required: true },
        { name: 'email', label: 'E-mail', type: 'email' },
        { name: 'telephone', label: 'Téléphone', type: 'tel' },
        { name: 'fonction', label: 'Fonction', full: true },
        { name: 'financement', label: 'Financement de cette inscription', full: true, default: s.financement },
        { name: 'besoins_specifiques', label: 'Besoins spécifiques / adaptations', type: 'textarea' },
      ],
      submitLabel: 'Inscrire',
      onSubmit: async (v) => {
        const { financement, ...stagiaire } = v;
        await reload(await post(`/sessions/${s.id}/inscriptions`, { stagiaire, financement }));
        toast('Stagiaire inscrit', 'success');
      },
    });
  });

  $('[data-add-existing]', body)?.addEventListener('click', async () => {
    const all = await get('/stagiaires');
    const already = new Set(s.inscriptions.map((i) => i.stagiaire_id));
    const list = all.filter((x) => !already.has(x.id));
    if (!list.length) return toast('Aucun autre stagiaire enregistré : créez-en un nouveau.');
    const m = openModal({
      title: 'Inscrire des stagiaires existants',
      content: html`<input type="search" placeholder="Filtrer…" data-f style="margin-bottom:10px">
        <div data-l style="max-height:50vh;overflow:auto">${raw(list.map((x) => html`<label style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--line)" data-name="${(x.nom + ' ' + x.prenom).toLowerCase()}">
          <input type="checkbox" value="${x.id}"> ${x.nom.toUpperCase()} ${x.prenom} <small>${x.email || ''}</small></label>`).join(''))}</div>
        <div class="form-actions"><button class="btn" data-close>Annuler</button><button class="btn btn-primary" data-ok>Inscrire la sélection</button></div>`,
    });
    $('[data-f]', m.el).addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      $$('[data-name]', m.el).forEach((l) => (l.hidden = !l.dataset.name.includes(q)));
    });
    $('[data-ok]', m.el).addEventListener('click', async () => {
      const ids = $$('input[type=checkbox]:checked', m.el).map((c) => +c.value);
      if (!ids.length) return;
      let last;
      try {
        for (const sid of ids) last = await post(`/sessions/${s.id}/inscriptions`, { stagiaire_id: sid, financement: s.financement });
        m.close();
        await reload(last);
        toast(`${ids.length} stagiaire(s) inscrit(s)`, 'success');
      } catch (e) {
        toastError(e);
        await reload();
      }
    });
  });

  $$('[data-acces]', body).forEach((b) => b.addEventListener('click', async () => {
    const i = s.inscriptions.find((x) => String(x.id) === b.dataset.acces);
    const url = portailUrl(i.acces_token);
    const img = await qrDataUrl(url, 260);
    const m = openModal({
      title: `Accès portail — ${i.prenom} ${i.nom}`,
      content: html`<div style="text-align:center"><img src="${img}" alt="QR code personnel" style="width:260px">
        <p>Lien personnel (ne pas partager) :</p>
        <p><input readonly value="${url}" data-url></p>
        <p>Ou, sur <strong>${portailBaseUrl()}</strong> : code session <span class="kbd-code">${s.code_public}</span> + code personnel <span class="kbd-code">${i.code_acces}</span></p>
        <div class="form-actions" style="justify-content:center"><button class="btn" data-copy>Copier le lien</button>
        ${canWrite() ? raw('<button class="btn btn-ghost" data-reset style="color:var(--red)">Générer un nouvel accès</button>') : ''}</div></div>`,
    });
    $('[data-copy]', m.el).addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        toast('Lien copié', 'success');
      } catch {
        $('[data-url]', m.el).select();
      }
    });
    $('[data-reset]', m.el)?.addEventListener('click', async () => {
      if (!(await confirmDialog("L'ancien lien, l'ancien code et les convocations déjà émises ne fonctionneront plus. Continuer ?"))) return;
      m.close();
      await reload(await post(`/inscriptions/${i.id}/nouvel-acces`));
      toast('Nouvel accès généré — réémettez la convocation', 'success');
    });
  }));

  $$('[data-edit]', body).forEach((b) => b.addEventListener('click', () => {
    const i = s.inscriptions.find((x) => String(x.id) === b.dataset.edit);
    const m = formModal({
      title: `Inscription — ${i.prenom} ${i.nom}`,
      fields: [
        { name: 'statut', label: 'Statut', type: 'select', options: opts(STATUT_INSCRIPTION) },
        { name: 'financement', label: 'Financement' },
      ],
      values: i,
      extra: html`<div class="full"><button type="button" class="btn btn-ghost" data-remove style="color:var(--red)">Retirer de la session</button></div>`,
      onSubmit: async (v) => { await reload(await put(`/inscriptions/${i.id}`, v)); toast('Enregistré', 'success'); },
    });
    $('[data-remove]', m.el).addEventListener('click', async () => {
      if (!(await confirmDialog('Retirer ce stagiaire de la session ?', { ok: 'Retirer', danger: true }))) return;
      try {
        const next = await del(`/inscriptions/${i.id}`);
        m.close();
        await reload(next);
      } catch (e) {
        toastError(e);
      }
    });
  }));
}

// ── Émargement
function tabEmargement({ s, reload, body }) {
  const inscrits = s.inscriptions.filter((i) => i.statut !== 'annule');
  const emarg = new Map(s.emargements.map((e) => [`${e.creneau_id}-${e.inscription_id}`, e]));
  const days = groupByDay(s.creneaux);
  const cell = (c, i) => {
    const e = emarg.get(`${c.id}-${i.id}`);
    if (!e) return html`<button class="btn btn-small" data-cell="${c.id}-${i.id}">—</button>`;
    const label = e.statut === 'present' ? (e.a_signature ? '✔ signé' : '✔ présent') : e.statut === 'absent' ? 'Absent' : 'Abs. justifié';
    const tone = e.statut === 'present' ? 'green' : e.statut === 'absent' ? 'red' : 'orange';
    return html`<button class="btn btn-small" data-cell="${c.id}-${i.id}" title="${e.mode} · ${fmtDateTime(e.signed_at)}">${raw(badge(label, tone))}</button>`;
  };

  body.innerHTML = html`<div class="card">
    <div class="card-head"><h2>Feuille d'émargement</h2>
      <div class="actions"><a class="btn" href="/document.html#feuille=${s.id}" target="_blank" rel="noopener">Imprimer / PDF</a>
      <a class="btn btn-primary" href="#/emargement/${s.id}">Faire signer sur cet appareil</a></div></div>
    <p class="muted">Les stagiaires signent eux-mêmes depuis leur téléphone (QR de salle ou lien personnel) le jour du créneau, ou sur votre tablette. Cliquez une case pour saisir une présence/absence (ex. feuille papier).</p>
    ${!s.creneaux.length ? raw(emptyState("Saisissez d'abord le planning.")) : !inscrits.length ? raw(emptyState('Aucun stagiaire inscrit.')) : ''}
    ${raw(days.map((d) => html`<h3 style="margin-top:18px">${fmtDateLong(d.date)}</h3><div class="table-wrap"><table class="table emarg-grid"><thead><tr><th>Stagiaire</th>
      ${raw(d.creneaux.map((c) => html`<th>${periodeLabel(c)}<br><small>${fmtHeure(c.heure_debut)}–${fmtHeure(c.heure_fin)}</small></th>`).join(''))}</tr></thead><tbody>
      ${raw(inscrits.map((i) => html`<tr><td>${i.nom.toUpperCase()} ${i.prenom}</td>${raw(d.creneaux.map((c) => `<td class="emarg-cell">${cell(c, i)}</td>`).join(''))}</tr>`).join(''))}
      <tr><td><em>Formateur</em></td>${raw(d.creneaux.map((c) => html`<td class="emarg-cell"><button class="btn btn-small" data-formateur="${c.id}">${c.formateur_a_signe ? raw(badge('✔ signé', 'green')) : 'Signer'}</button></td>`).join(''))}</tr>
      </tbody></table></div>`).join(''))}
  </div>`;

  $$('[data-cell]', body).forEach((b) => b.addEventListener('click', () => {
    const [cid, iid] = b.dataset.cell.split('-').map(Number);
    const c = s.creneaux.find((x) => x.id === cid);
    const i = s.inscriptions.find((x) => x.id === iid);
    const e = emarg.get(b.dataset.cell);
    editEmargement(s, c, i, e, reload);
  }));
  $$('[data-formateur]', body).forEach((b) => b.addEventListener('click', () => {
    const c = s.creneaux.find((x) => String(x.id) === b.dataset.formateur);
    signModal(`Signature du formateur — ${fmtDate(c.date)} ${periodeLabel(c)}`, async (sig) => {
      await reload(await post(`/creneaux/${c.id}/signature-formateur`, { signature: sig }));
      toast('Signature enregistrée', 'success');
    });
  }));
}

function editEmargement(s, c, i, e, reload) {
  if (e?.mode === 'portail') {
    openModal({ title: `${i.prenom} ${i.nom}`, content: html`<p>Signé par le stagiaire depuis son téléphone le ${fmtDateTime(e.signed_at)}.</p>
      ${canWrite() ? raw('<p class="muted">Pour corriger une erreur, supprimez cet émargement.</p><div class="form-actions"><button class="btn btn-danger" data-rm>Supprimer l\'émargement</button></div>') : ''}` })
      .el.querySelector('[data-rm]')?.addEventListener('click', async (ev) => {
        if (!(await confirmDialog('Supprimer cet émargement signé par le stagiaire ?', { ok: 'Supprimer', danger: true }))) return;
        ev.target.closest('.modal-backdrop').remove();
        await reload(await del(`/emargements/${e.id}`));
      });
    return;
  }
  const m = openModal({
    title: `${i.prenom} ${i.nom} — ${fmtDate(c.date)} ${periodeLabel(c)}`,
    content: html`<div class="grid" style="gap:8px">
      <button class="btn btn-primary" data-sign>Présent — signer sur cet appareil</button>
      <button class="btn" data-set="present">Présent (feuille papier signée)</button>
      <button class="btn" data-set="absent">Absent</button>
      <button class="btn" data-set="absent_justifie">Absent justifié</button>
      ${e && canWrite() ? raw('<button class="btn btn-ghost" data-rm style="color:var(--red)">Effacer la saisie</button>') : ''}
    </div>`,
  });
  const save = async (statut, signature = null, mode = 'manuel') => {
    try {
      await reload(await post(`/creneaux/${c.id}/emargements`, { inscription_id: i.id, statut, signature, mode }));
      m.close();
    } catch (err) {
      toastError(err);
    }
  };
  $$('[data-set]', m.el).forEach((b) => b.addEventListener('click', () => save(b.dataset.set)));
  $('[data-sign]', m.el).addEventListener('click', () => {
    m.close();
    signModal(`Signature — ${i.prenom} ${i.nom}`, async (sig) => {
      await reload(await post(`/creneaux/${c.id}/emargements`, { inscription_id: i.id, statut: 'present', signature: sig, mode: 'tablette' }));
    });
  });
  $('[data-rm]', m.el)?.addEventListener('click', async () => {
    m.close();
    await reload(await del(`/emargements/${e.id}`));
  });
}

/** Modale de signature ; onSign(dataUrl) async. */
export function signModal(title, onSign) {
  const m = openModal({
    title,
    content: html`<canvas class="signature-box" data-pad aria-label="Zone de signature"></canvas>
      <div class="form-actions"><button class="btn" data-clear>Effacer</button><button class="btn btn-primary" data-ok>Valider la signature</button></div>`,
  });
  const pad = signaturePad($('[data-pad]', m.el));
  $('[data-clear]', m.el).addEventListener('click', () => pad.clear());
  $('[data-ok]', m.el).addEventListener('click', async (e) => {
    if (pad.isEmpty()) return toast('Signez dans le cadre', 'error');
    e.target.disabled = true;
    try {
      await onSign(pad.toDataURL());
      m.close();
    } catch (err) {
      toastError(err);
      e.target.disabled = false;
    }
  });
  return m;
}

// ── Questionnaires
async function tabQuestionnaires({ s, reload, body }) {
  const inscrits = s.inscriptions.filter((i) => i.statut === 'inscrit').length;
  const all = canWrite() ? await get('/questionnaires?actif=1') : [];
  body.innerHTML = html`<div class="card">
    <div class="card-head"><h2>Évaluations de la session</h2></div>
    <p class="muted">Parcours conseillé : recueil des besoins <em>avant</em> · QCM <em>début</em> et <em>fin</em> (progression) · satisfaction à chaud <em>fin</em> · évaluation à froid <em>après</em>. Les stagiaires répondent depuis le portail.</p>
    ${s.questionnaires.length ? raw(html`<div class="table-wrap"><table class="table"><thead><tr><th>Questionnaire</th><th>Moment</th><th>Réponses</th><th>Ouvert aux stagiaires</th><th></th></tr></thead><tbody>
      ${raw(s.questionnaires.map((q) => html`<tr><td><strong>${q.titre}</strong><br><small>${TYPE_QUESTIONNAIRE[q.type]}</small></td>
        <td>${MOMENT[q.moment]}</td>
        <td>${q.nb_reponses} / ${inscrits}<div class="bar" style="width:90px"><span style="width:${inscrits ? Math.round((100 * q.nb_reponses) / inscrits) : 0}%"></span></div></td>
        <td><label><input type="checkbox" data-open="${q.id}" ${q.ouvert ? raw('checked') : ''}> ${q.ouvert ? 'Ouvert' : 'Fermé'}</label></td>
        <td class="actions"><button class="btn btn-small" data-res="${q.id}">Résultats</button>
          ${canWrite() && !q.nb_reponses ? raw(html` <button class="icon-btn" data-detach="${q.id}" aria-label="Retirer">✕</button>`) : ''}</td></tr>`).join(''))}
      </tbody></table></div>`) : raw(emptyState('Aucune évaluation rattachée.'))}
    ${canWrite() ? raw(html`<h3 style="margin-top:18px">Rattacher un questionnaire</h3><div class="toolbar">
      <select data-q>${raw(all.map((q) => html`<option value="${q.id}">${q.titre} — ${TYPE_QUESTIONNAIRE[q.type]}</option>`).join(''))}</select>
      <select data-m>${raw(opts(MOMENT).map(([k, l]) => html`<option value="${k}">${l}</option>`).join(''))}</select>
      <button class="btn btn-primary" data-attach>Rattacher</button> <a href="#/questionnaires" class="muted">Gérer les questionnaires</a></div>`) : ''}
    ${s.questionnaires.some((q) => q.type === 'evaluation_acquis') ? raw('<div data-progress></div>') : ''}
  </div>`;

  const defaultMoment = { positionnement: 'avant', evaluation_acquis: 'debut', satisfaction_chaud: 'fin', satisfaction_froid: 'a_froid', satisfaction_client: 'a_froid' };
  $('[data-q]', body)?.addEventListener('change', (e) => {
    const q = all.find((x) => String(x.id) === e.target.value);
    if (q && defaultMoment[q.type]) $('[data-m]', body).value = defaultMoment[q.type];
  });
  $('[data-q]', body)?.dispatchEvent(new Event('change'));
  $('[data-attach]', body)?.addEventListener('click', async () => {
    try {
      await reload(await post(`/sessions/${s.id}/questionnaires`, { questionnaire_id: $('[data-q]', body).value, moment: $('[data-m]', body).value }));
      toast('Questionnaire rattaché', 'success');
    } catch (e) {
      toastError(e);
    }
  });
  $$('[data-open]', body).forEach((c) => c.addEventListener('change', async () => {
    try {
      await reload(await put(`/session-questionnaires/${c.dataset.open}`, { ouvert: c.checked }));
    } catch (e) {
      toastError(e);
    }
  }));
  $$('[data-detach]', body).forEach((b) => b.addEventListener('click', async () => {
    try {
      await reload(await del(`/session-questionnaires/${b.dataset.detach}`));
    } catch (e) {
      toastError(e);
    }
  }));
  $$('[data-res]', body).forEach((b) => b.addEventListener('click', () => showResultats(+b.dataset.res)));

  const progress = $('[data-progress]', body);
  if (progress) {
    const acquis = s.questionnaires.filter((q) => q.type === 'evaluation_acquis');
    const results = await Promise.all(acquis.map((q) => get(`/session-questionnaires/${q.id}/resultats`)));
    const byStagiaire = new Map();
    results.forEach((r) => r.reponses.forEach((rep) => {
      const k = rep.inscription_id;
      if (!byStagiaire.has(k)) byStagiaire.set(k, { nom: `${rep.nom.toUpperCase()} ${rep.prenom}`, scores: {} });
      if (rep.score_max) byStagiaire.get(k).scores[r.questionnaire.moment] = Math.round((100 * rep.score) / rep.score_max);
    }));
    if (byStagiaire.size) {
      progress.innerHTML = html`<h3 style="margin-top:18px">Progression (QCM)</h3><div class="table-wrap"><table class="table"><thead><tr><th>Stagiaire</th>${raw(Object.entries(MOMENT).map(([, l]) => html`<th>${l}</th>`).join(''))}</tr></thead><tbody>
        ${raw([...byStagiaire.values()].map((x) => html`<tr><td>${x.nom}</td>${raw(Object.keys(MOMENT).map((m) => html`<td>${x.scores[m] !== undefined ? x.scores[m] + ' %' : ''}</td>`).join(''))}</tr>`).join(''))}
      </tbody></table></div>`;
    }
  }
}

export async function showResultats(sqId) {
  const r = await get(`/session-questionnaires/${sqId}/resultats`);
  const q = r.questionnaire;
  const syn = r.synthese;
  const block = (qq) => {
    const x = syn[qq.id];
    let content = '';
    if (qq.type === 'echelle') {
      content = html`<p><strong>${x.moyenne ?? '—'} / 5</strong> (${x.n} réponse(s))</p>
        <div class="chips">${raw(x.repartition.map((n, k) => html`<span class="badge badge-grey">${k + 1} : ${n}</span>`).join(''))}</div>`;
    } else if (qq.type === 'oui_non') {
      content = html`<p>Oui : <strong>${x.oui}</strong> · Non : <strong>${x.non}</strong></p>`;
    } else if (qq.type === 'texte') {
      content = x.textes.length ? html`<ul>${raw(x.textes.map((t) => html`<li>${t}</li>`).join(''))}</ul>` : '<p class="muted">Aucune réponse</p>';
    } else {
      content = html`${x.taux_reussite !== undefined ? raw(html`<p>Taux de bonnes réponses : <strong>${x.taux_reussite ?? '—'} %</strong></p>`) : ''}
        <ul>${raw(qq.options.map((o, k) => html`<li>${o} : ${x.repartition[k]}${(qq.correct || []).includes(k) ? raw(' ' + badge('bonne réponse', 'green')) : ''}</li>`).join(''))}</ul>`;
    }
    return html`<div class="card"><h3>${qq.libelle}</h3>${raw(content)}</div>`;
  };
  const scored = r.reponses.some((x) => x.score_max);
  openModal({
    title: `${q.titre} — ${MOMENT[q.moment]}`,
    wide: true,
    content: html`<p class="muted">${r.reponses.length} réponse(s)</p>
      ${scored ? raw(html`<div class="card"><h3>Scores individuels</h3><table class="table"><tbody>${raw(r.reponses.map((x) => html`<tr><td>${x.nom.toUpperCase()} ${x.prenom}</td><td>${fmtNum(x.score)} / ${fmtNum(x.score_max)}</td><td>${Math.round((100 * x.score) / x.score_max)} %</td><td><small>${fmtDateTime(x.submitted_at)}</small></td></tr>`).join(''))}</tbody></table></div>`)
        : raw(html`<div class="card"><h3>Répondants</h3><p>${r.reponses.map((x) => `${x.prenom} ${x.nom}`).join(', ') || '—'}</p></div>`)}
      ${raw(q.questions.map(block).join(''))}`,
  });
}

// ── Documents
function tabDocuments({ s, reload, body }) {
  const byType = (t) => s.documents.filter((d) => d.type === t);
  const nom = (iid) => {
    const i = s.inscriptions.find((x) => x.id === iid);
    return i ? `${i.prenom} ${i.nom}` : '';
  };
  const types = [
    ['convention', 'Avec le client (ou le stagiaire s\'il finance lui-même). À faire signer avant la formation.'],
    ['convocation', 'Une par stagiaire, avec son QR code d\'accès au portail.'],
    ['attestation', 'Fin de formation : heures réellement suivies (émargements) et résultats de l\'évaluation.'],
    ['certificat_realisation', 'Modèle du ministère du Travail, exigé par les financeurs (OPCO…).'],
  ];
  body.innerHTML = html`${raw(types.map(([t, help]) => {
    const docs = byType(t);
    return html`<div class="card"><div class="card-head"><div><h2>${TYPE_DOCUMENT[t]}</h2><small class="muted">${help}</small></div>
      <div class="actions">${docs.length ? raw(html`<a class="btn" target="_blank" rel="noopener" href="/document.html#doc=${latestPerTarget(docs).map((d) => d.id).join(',')}">Tout imprimer</a>`) : ''}
      ${canWrite() ? raw(html`<button class="btn btn-primary" data-emit="${t}">${docs.length ? 'Réémettre' : 'Émettre'}</button>`) : ''}</div></div>
      ${docs.length ? raw(html`<table class="table"><tbody>${raw(docs.map((d) => html`<tr><td>${d.numero}</td><td>${d.inscription_id ? nom(d.inscription_id) : ''}</td><td><small>${fmtDateTime(d.created_at)}</small></td>
        <td class="actions"><a class="btn btn-small" target="_blank" rel="noopener" href="/document.html#doc=${d.id}">Ouvrir</a></td></tr>`).join(''))}</tbody></table>`) : raw('<p class="muted">Aucun document émis.</p>')}
    </div>`;
  }).join(''))}
  <div class="card"><div class="card-head"><div><h2>Feuille d'émargement</h2><small class="muted">Toujours à jour des signatures.</small></div>
    <a class="btn" target="_blank" rel="noopener" href="/document.html#feuille=${s.id}">Ouvrir</a></div></div>`;

  $$('[data-emit]', body).forEach((b) => b.addEventListener('click', async () => {
    const type = b.dataset.emit;
    const inscrits = s.inscriptions.filter((i) => i.statut !== 'annule');
    if (type !== 'convention' && !inscrits.length) return toast('Aucun stagiaire inscrit', 'error');
    let warn = '';
    if (type === 'attestation' || type === 'certificat_realisation') {
      const presents = new Set(s.emargements.filter((e) => e.statut === 'present').map((e) => e.inscription_id));
      const sans = inscrits.filter((i) => !presents.has(i.id));
      if (sans.length) warn = `Attention : aucune présence émargée pour ${sans.map((i) => i.prenom + ' ' + i.nom).join(', ')} (0 h sur le document). `;
    }
    if (!(await confirmDialog(`${warn}Émettre ${TYPE_DOCUMENT[type].toLowerCase()}${type === 'convention' ? '' : ' pour chaque stagiaire'} ? Chaque document reçoit un numéro unique et ses données sont figées.`, { ok: 'Émettre' }))) return;
    try {
      const r = await post(`/sessions/${s.id}/documents`, { type });
      window.open(`/document.html#doc=${r.documents.join(',')}`, '_blank', 'noopener');
      await reload();
      toast('Documents émis', 'success');
    } catch (e) {
      toastError(e);
    }
  }));
}

/** Dernière version de chaque document (par stagiaire) pour l'impression groupée. */
function latestPerTarget(docs) {
  const seen = new Map();
  for (const d of docs) if (!seen.has(d.inscription_id ?? 0)) seen.set(d.inscription_id ?? 0, d);
  return [...seen.values()];
}
