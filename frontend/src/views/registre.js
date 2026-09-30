// Registres Qualiopi : veille, réclamations, amélioration continue, partenaires, handicap, incidents.
import { get, post, put, del } from '../api.js';
import { html, raw, $, $$, badge, emptyState, formModal, confirmDialog, toast, toastError, fmtDate } from '../ui.js';
import { TYPE_REGISTRE, STATUT_REGISTRE, opts } from '../labels.js';

const AIDE = {
  veille: 'Veille légale et réglementaire, veille métiers/compétences, innovations pédagogiques et technologiques (indicateurs 23 à 25). Notez la source et ce que vous en faites.',
  reclamation: 'Toute réclamation (stagiaire, client, financeur) : réception, analyse, réponse apportée, action (indicateur 31).',
  amelioration: 'Actions d\'amélioration issues des évaluations, réclamations, aléas, audits (indicateur 32).',
  partenaire: 'Réseau de partenaires, sous-traitants, acteurs du handicap, du territoire (indicateurs 26 à 29).',
  handicap: 'Demandes d\'adaptation et réponses apportées, contacts avec les partenaires handicap (indicateur 26).',
  incident: 'Aléas, difficultés, abandons, interruptions : ce qui s\'est passé et comment vous avez réagi.',
};

const LABELS = {
  veille: { source: 'Source (texte, site, newsletter…)', actions: 'Impact / décision prise' },
  reclamation: { source: 'Émetteur (stagiaire, client, financeur…)', actions: 'Analyse, réponse et action corrective' },
  amelioration: { source: 'Origine (évaluation, réclamation, audit…)', actions: 'Action mise en place' },
  partenaire: { source: 'Type de partenariat', actions: 'Modalités / contacts' },
  handicap: { source: 'Demandeur', actions: 'Adaptation proposée' },
  incident: { source: 'Session / personne concernée', actions: 'Mesures prises' },
};

export async function renderRegistre(el, type, alive = () => true) {
  if (!TYPE_REGISTRE[type]) type = 'veille';
  const rows = await get(`/registre?type=${type}`);
  if (!alive()) return;
  el.innerHTML = html`<div class="page-head"><div><h1>Registres</h1><p class="muted">${AIDE[type]}</p></div>
    <div class="actions"><button class="btn btn-primary" data-new>+ Nouvelle entrée</button></div></div>
    <div class="tabs">${raw(Object.entries(TYPE_REGISTRE).map(([k, l]) => html`<button class="${k === type ? 'active' : ''}" data-type="${k}">${l}</button>`).join(''))}</div>
    <div class="card">${rows.length ? raw(html`<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Objet</th><th>${LABELS[type].source.split(' (')[0]}</th><th>Statut</th></tr></thead><tbody>
      ${raw(rows.map((r) => html`<tr class="clickable" data-id="${r.id}"><td>${fmtDate(r.date)}</td><td><strong>${r.titre}</strong><br><small>${(r.description || '').slice(0, 140)}</small></td><td>${r.source || ''}</td><td>${raw(badge(...STATUT_REGISTRE[r.statut]))}${r.echeance && r.statut !== 'clos' ? raw(html`<br><small>échéance ${fmtDate(r.echeance)}</small>`) : ''}</td></tr>`).join(''))}
      </tbody></table></div>`) : raw(emptyState('Aucune entrée.'))}</div>`;

  $$('[data-type]', el).forEach((b) => b.addEventListener('click', () => (location.hash = `#/registre/${b.dataset.type}`)));
  const fields = [
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'statut', label: 'Statut', type: 'select', options: opts(STATUT_REGISTRE) },
    { name: 'titre', label: 'Objet', required: true, full: true },
    { name: 'source', label: LABELS[type].source, full: true },
    { name: 'description', label: 'Description', type: 'textarea', rows: 4 },
    { name: 'actions', label: LABELS[type].actions, type: 'textarea', rows: 4 },
    { name: 'responsable', label: 'Responsable' },
    { name: 'echeance', label: 'Échéance', type: 'date' },
  ];
  const edit = (row) => {
    const m = formModal({
      title: row ? 'Modifier' : `Nouvelle entrée — ${TYPE_REGISTRE[type]}`,
      fields,
      wide: true,
      values: row || { date: new Date().toLocaleDateString('sv-SE'), statut: type === 'veille' || type === 'partenaire' ? 'clos' : 'ouvert' },
      extra: row ? html`<div class="full"><button type="button" class="btn btn-ghost" data-del style="color:var(--red)">Supprimer</button></div>` : '',
      onSubmit: async (v) => {
        if (row) await put(`/registre/${row.id}`, v);
        else await post('/registre', { ...v, type });
        toast('Enregistré', 'success');
        renderRegistre(el, type);
      },
    });
    $('[data-del]', m.el)?.addEventListener('click', async () => {
      if (!(await confirmDialog('Supprimer cette entrée ? Les registres servent de preuve lors de l\'audit.', { ok: 'Supprimer', danger: true }))) return;
      try {
        await del(`/registre/${row.id}`);
        m.close();
        renderRegistre(el, type);
      } catch (e) {
        toastError(e);
      }
    });
  };
  $('[data-new]', el).addEventListener('click', () => edit(null));
  $$('tr[data-id]', el).forEach((tr) => tr.addEventListener('click', () => edit(rows.find((r) => String(r.id) === tr.dataset.id))));
}
