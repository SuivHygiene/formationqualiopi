// Mode tablette : le formateur fait signer les stagiaires sur son appareil.
import { get, post } from '../api.js';
import { html, raw, $, $$, badge, emptyState, fmtDateLong, fmtHeure, toast } from '../ui.js';
import { periodeLabel } from './planning.js';
import { signModal } from './sessions.js';

export async function renderEmargementTablette(el, id, alive = () => true) {
  let s = await get(`/sessions/${id}`);
  if (!alive()) return;
  const today = new Date().toLocaleDateString('sv-SE');
  const sorted = [...s.creneaux].sort((a, b) => (a.date + a.heure_debut).localeCompare(b.date + b.heure_debut));
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const guess = sorted.find((c) => c.date === today && toMin(c.heure_fin) >= nowMin) || sorted.find((c) => c.date === today) || sorted.find((c) => c.date >= today) || sorted.at(-1);
  let current = guess?.id;

  const draw = () => {
    const c = s.creneaux.find((x) => x.id === current);
    const inscrits = s.inscriptions.filter((i) => i.statut === 'inscrit');
    const em = new Map(s.emargements.filter((e) => e.creneau_id === current).map((e) => [e.inscription_id, e]));
    el.innerHTML = html`<div class="page-head"><div><a href="#/sessions/${s.id}/emargement" class="muted">← Retour à la session</a><h1>Émargement — ${s.intitule}</h1></div></div>
      ${!sorted.length ? raw(emptyState('Aucun créneau planifié.')) : raw(html`<div class="card">
        <label>Créneau <select data-creneau>${raw(sorted.map((x) => html`<option value="${x.id}" ${x.id === current ? raw('selected') : ''}>${fmtDateLong(x.date)} — ${periodeLabel(x)} ${fmtHeure(x.heure_debut)}–${fmtHeure(x.heure_fin)}</option>`).join(''))}</select></label>
        ${c && c.date !== today ? raw('<div class="alert alert-warn" style="margin-top:10px">Ce créneau n\'est pas aujourd\'hui. Faites signer le jour même pour que la feuille soit probante.</div>') : ''}
      </div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">
        ${raw(inscrits.map((i) => {
          const e = em.get(i.id);
          return html`<button class="card" style="text-align:left;cursor:pointer;min-height:90px;font:inherit" data-sign="${i.id}" ${e ? raw('disabled') : ''}>
            <strong style="font-size:1.1rem">${i.prenom} ${i.nom.toUpperCase()}</strong><br>
            ${e ? raw(badge(e.statut === 'present' ? '✔ Signé' : 'Absent', e.statut === 'present' ? 'green' : 'red')) : raw('<span class="muted">Toucher pour signer</span>')}</button>`;
        }).join(''))}
        <button class="card" style="text-align:left;cursor:pointer;min-height:90px;font:inherit;border-style:dashed" data-formateur>
          <strong>Formateur</strong><br>${c?.formateur_a_signe ? raw(badge('✔ Signé', 'green')) : raw('<span class="muted">Signature du formateur</span>')}</button>
      </div>`)}`;
    $('[data-creneau]', el)?.addEventListener('change', (e) => { current = +e.target.value; draw(); });
    $$('[data-sign]', el).forEach((b) => b.addEventListener('click', () => {
      const i = s.inscriptions.find((x) => String(x.id) === b.dataset.sign);
      signModal(`${i.prenom} ${i.nom} — je certifie être présent(e)`, async (sig) => {
        s = await post(`/creneaux/${current}/emargements`, { inscription_id: i.id, statut: 'present', signature: sig, mode: 'tablette' });
        toast(`Merci ${i.prenom} !`, 'success');
        draw();
      });
    }));
    $('[data-formateur]', el)?.addEventListener('click', () => signModal('Signature du formateur', async (sig) => {
      s = await post(`/creneaux/${current}/signature-formateur`, { signature: sig });
      draw();
    }));
  };
  draw();
}

const toMin = (t) => {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
};
