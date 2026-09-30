// Listes + formulaires des référentiels simples (formations, clients, stagiaires, formateurs).
// Les fonctions de colonnes renvoient du HTML déjà sûr (html``, esc(), badge()).
import { get, post, put, del } from '../api.js';
import { html, raw, esc, $, badge, emptyState, formModal, confirmDialog, toast, toastError, debounce, fmtDate, fmtNum, fmtEuro } from '../ui.js';
import { MODALITE, STATUT_FORMATEUR, opts } from '../labels.js';
import { canWrite } from '../state.js';

const clientOptions = async () => [['', '— Aucune (particulier) —'], ...(await get('/clients')).map((c) => [c.id, c.raison_sociale])];

export const RESOURCES = {
  formations: {
    title: 'Catalogue de formations',
    intro: 'Vos programmes : ils alimentent les conventions, convocations et attestations. Un programme complet couvre le critère 1 de Qualiopi.',
    endpoint: '/formations',
    singular: 'formation',
    wide: true,
    columns: [
      ['Formation', (r) => html`<strong>${r.titre}</strong>${r.code ? raw(html` <small>(${r.code})</small>`) : ''}<br><small>${r.domaine || ''}</small>`],
      ['Durée', (r) => (r.duree_heures ? esc(`${fmtNum(r.duree_heures)} h`) : '')],
      ['Modalité', (r) => esc(MODALITE[r.modalite] || '')],
      ['Tarif', (r) => esc([r.tarif_inter && `Inter ${fmtEuro(r.tarif_inter)}`, r.tarif_intra && `Intra ${fmtEuro(r.tarif_intra)}`].filter(Boolean).join(' · '))],
      ['', (r) => (r.actif ? '' : badge('Archivée'))],
    ],
    fields: () => [
      { name: 'titre', label: 'Intitulé', required: true, full: true },
      { name: 'code', label: 'Code interne' },
      { name: 'domaine', label: 'Domaine', placeholder: 'Hygiène, management, sécurité…' },
      { name: 'duree_heures', label: 'Durée (heures)', type: 'number', step: '0.5' },
      { name: 'duree_jours', label: 'Durée (jours)', type: 'number', step: '0.5' },
      { name: 'modalite', label: 'Modalité', type: 'select', options: opts(MODALITE) },
      { name: 'delai_acces', label: "Délai d'accès", placeholder: 'Ex. : 15 jours après signature' },
      { name: 'tarif_inter', label: 'Tarif inter (€ HT / pers.)', type: 'number', step: '0.01' },
      { name: 'tarif_intra', label: 'Tarif intra (€ HT / groupe)', type: 'number', step: '0.01' },
      { section: 'Programme (critère 1 et 2 Qualiopi)' },
      { name: 'objectifs', label: 'Objectifs opérationnels et évaluables', type: 'textarea', rows: 4 },
      { name: 'public_vise', label: 'Public visé', type: 'textarea', rows: 2 },
      { name: 'prerequis', label: 'Prérequis', type: 'textarea', rows: 2 },
      { name: 'contenu', label: 'Contenu / déroulé', type: 'textarea', rows: 8 },
      { name: 'methodes_pedagogiques', label: 'Méthodes pédagogiques', type: 'textarea' },
      { name: 'moyens_techniques', label: 'Moyens techniques et d\'encadrement', type: 'textarea' },
      { name: 'modalites_evaluation', label: "Modalités d'évaluation", type: 'textarea' },
      { name: 'accessibilite', label: 'Accessibilité aux personnes en situation de handicap', type: 'textarea' },
      { name: 'indicateurs_resultats', label: 'Indicateurs de résultats publiés', type: 'textarea', help: 'Taux de satisfaction, de réussite… (critère 1).' },
      { name: 'version', label: 'Version du programme', type: 'number' },
      { name: 'actif', label: 'Formation active (décochez pour archiver)', type: 'checkbox', default: true },
    ],
  },
  clients: {
    title: 'Entreprises clientes',
    intro: 'Les commanditaires (employeurs, structures) de vos formations.',
    endpoint: '/clients',
    singular: 'entreprise',
    columns: [
      ['Raison sociale', (r) => html`<strong>${r.raison_sociale}</strong><br><small>${r.siret || ''}</small>`],
      ['Ville', (r) => esc(r.ville)],
      ['Contact', (r) => html`${r.contact_nom || ''}<br><small>${r.contact_email || ''} ${r.contact_tel || ''}</small>`],
    ],
    fields: () => [
      { name: 'raison_sociale', label: 'Raison sociale', required: true, full: true },
      { name: 'siret', label: 'SIRET' },
      { name: 'adresse', label: 'Adresse' },
      { name: 'code_postal', label: 'Code postal' },
      { name: 'ville', label: 'Ville' },
      { section: 'Contact' },
      { name: 'contact_nom', label: 'Nom du contact' },
      { name: 'contact_fonction', label: 'Fonction' },
      { name: 'contact_email', label: 'E-mail', type: 'email' },
      { name: 'contact_tel', label: 'Téléphone', type: 'tel' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  stagiaires: {
    title: 'Stagiaires',
    intro: 'Toutes les personnes formées. Les besoins spécifiques sont transmis au référent handicap.',
    endpoint: '/stagiaires',
    singular: 'stagiaire',
    prepare: async () => ({ clients: await clientOptions() }),
    columns: [
      ['Nom', (r) => html`<strong>${r.nom.toUpperCase()} ${r.prenom}</strong>${r.besoins_specifiques ? raw(' ' + badge('Besoins spécifiques', 'orange')) : ''}`],
      ['Entreprise', (r, ctx) => esc(ctx.clients.find((c) => String(c[0]) === String(r.client_id))?.[1] || '')],
      ['Contact', (r) => html`${r.email || ''}<br><small>${r.telephone || ''}</small>`],
    ],
    fields: (ctx) => [
      { name: 'civilite', label: 'Civilité', type: 'select', options: [['', '—'], ['Mme', 'Mme'], ['M.', 'M.']] },
      { name: 'client_id', label: 'Entreprise', type: 'select', options: ctx.clients },
      { name: 'prenom', label: 'Prénom', required: true },
      { name: 'nom', label: 'Nom', required: true },
      { name: 'email', label: 'E-mail', type: 'email' },
      { name: 'telephone', label: 'Téléphone', type: 'tel' },
      { name: 'fonction', label: 'Fonction', full: true },
      { name: 'besoins_specifiques', label: 'Besoins spécifiques / adaptations (handicap…)', type: 'textarea', help: 'Donnée sensible : ne notez que ce qui est utile à l\'adaptation de la formation.' },
    ],
  },
  formateurs: {
    title: 'Formateurs',
    intro: 'Dossiers formateurs : compétences et développement professionnel (critère 5 Qualiopi).',
    endpoint: '/formateurs',
    singular: 'formateur',
    wide: true,
    columns: [
      ['Formateur', (r) => html`<strong>${r.prenom} ${r.nom}</strong><br><small>${STATUT_FORMATEUR[r.statut] || ''}</small>`],
      ['Spécialités', (r) => esc((r.specialites || '').slice(0, 90))],
      ['Dossier mis à jour', (r) => {
        if (!r.date_maj_cv) return badge('À compléter', 'red');
        const old = new Date(r.date_maj_cv) < new Date(Date.now() - 365 * 864e5);
        return html`${fmtDate(r.date_maj_cv)} ${old ? raw(badge('> 1 an', 'orange')) : ''}`;
      }],
      ['', (r) => (r.actif ? '' : badge('Inactif'))],
    ],
    fields: () => [
      { name: 'prenom', label: 'Prénom', required: true },
      { name: 'nom', label: 'Nom', required: true },
      { name: 'email', label: 'E-mail', type: 'email' },
      { name: 'telephone', label: 'Téléphone', type: 'tel' },
      { name: 'statut', label: 'Statut', type: 'select', options: opts(STATUT_FORMATEUR) },
      { name: 'date_maj_cv', label: 'Dernière mise à jour du dossier / CV', type: 'date' },
      { name: 'specialites', label: 'Domaines de compétence', type: 'textarea' },
      { name: 'diplomes', label: 'Diplômes, certifications', type: 'textarea' },
      { name: 'experience', label: 'Expérience professionnelle', type: 'textarea' },
      { name: 'formations_suivies', label: 'Formations suivies / développement des compétences', type: 'textarea', help: 'Dates et intitulés (indicateur 22).' },
      { name: 'signature', label: 'Signature (image, pour les documents)', type: 'image' },
      { name: 'actif', label: 'Actif', type: 'checkbox', default: true },
    ],
  },
};

export async function renderResource(el, key, alive = () => true) {
  const cfg = RESOURCES[key];
  const ctx = cfg.prepare ? await cfg.prepare() : {};
  let q = '';

  el.innerHTML = html`<div class="page-head"><div><h1>${cfg.title}</h1><p class="muted">${cfg.intro}</p></div>
    <div class="actions">${canWrite() ? raw(html`<button class="btn btn-primary" data-new>+ Ajouter</button>`) : ''}</div></div>
    <div class="card"><div class="toolbar"><input type="search" placeholder="Rechercher…" aria-label="Rechercher" data-search></div><div data-list></div></div>`;

  const load = async () => {
    const rows = await get(cfg.endpoint + (q ? `?q=${encodeURIComponent(q)}` : ''));
    if (!alive()) return;
    const box = $('[data-list]', el);
    if (!rows.length) {
      box.innerHTML = emptyState(q ? 'Aucun résultat.' : `Aucun(e) ${cfg.singular} pour l'instant.`);
      return;
    }
    box.innerHTML = html`<div class="table-wrap"><table class="table"><thead><tr>${raw(cfg.columns.map((c) => html`<th>${c[0]}</th>`).join(''))}</tr></thead>
      <tbody>${raw(rows.map((r) => html`<tr class="clickable" data-id="${r.id}">${raw(cfg.columns.map((c) => `<td>${c[1](r, ctx)}</td>`).join(''))}</tr>`).join(''))}</tbody></table></div>`;
    box.querySelectorAll('tr[data-id]').forEach((tr) =>
      tr.addEventListener('click', () => edit(rows.find((r) => String(r.id) === tr.dataset.id))),
    );
  };

  const edit = (row) => {
    const isNew = !row;
    const m = formModal({
      title: isNew ? `Nouveau / nouvelle ${cfg.singular}` : `Modifier`,
      fields: cfg.fields(ctx),
      values: row || {},
      wide: cfg.wide,
      submitLabel: canWrite() ? 'Enregistrer' : 'Fermer',
      extra: !isNew && canWrite() ? html`<div class="full"><button type="button" class="btn btn-ghost" data-delete style="color:var(--red)">Supprimer</button></div>` : '',
      onSubmit: async (values) => {
        if (!canWrite()) return;
        if (isNew) await post(cfg.endpoint, values);
        else await put(`${cfg.endpoint}/${row.id}`, values);
        toast('Enregistré', 'success');
        await load();
      },
    });
    m.el.querySelector('[data-delete]')?.addEventListener('click', async () => {
      if (!(await confirmDialog('Supprimer définitivement cet élément ?', { ok: 'Supprimer', danger: true }))) return;
      try {
        await del(`${cfg.endpoint}/${row.id}`);
        m.close();
        toast('Supprimé', 'success');
        await load();
      } catch (e) {
        toastError(e);
      }
    });
  };

  $('[data-new]', el)?.addEventListener('click', () => edit(null));
  $('[data-search]', el).addEventListener('input', debounce((e) => {
    q = e.target.value.trim();
    load().catch(toastError);
  }));
  await load();
}
