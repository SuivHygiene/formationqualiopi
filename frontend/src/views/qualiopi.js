// Synthèse des preuves par critère du Référentiel national qualité.
import { get } from '../api.js';
import { html, raw, $, badge, fmtDate } from '../ui.js';

const TONE = { ok: ['OK', 'green'], warn: ['À renforcer', 'orange'], ko: ['Manquant', 'red'] };

export async function renderQualiopi(el, alive = () => true) {
  const def = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const draw = async (depuis) => {
    const d = await get(`/qualiopi?depuis=${depuis}`);
    if (!alive()) return;
    el.innerHTML = html`<div class="page-head"><div><h1>Suivi des preuves Qualiopi</h1>
      <p class="muted">Ce que l'outil peut mesurer à partir de vos données, par critère du Référentiel national qualité (art. R6316-1 du code du travail). La correspondance avec les indicateurs est <strong>indicative</strong> : l'auditeur apprécie vos preuves dans leur ensemble, et une partie des indicateurs (sous-traitance, alternance, certifications…) n'est pas suivie ici.</p></div>
      <div class="actions"><label>Depuis le <input type="date" value="${d.depuis}" data-depuis style="width:auto"></label></div></div>
      <p class="muted">${d.nb_sessions} session(s) sur la période (du ${fmtDate(d.depuis)} à aujourd'hui).</p>
      ${raw(d.criteres.map((c) => html`<div class="card"><div class="card-head"><h2>Critère ${c.numero} — ${c.titre}</h2><small class="muted">Indicateurs ${c.indicateurs}</small></div>
        <table class="table"><tbody>${raw(c.items.map((it) => html`<tr><td>${it.label}${it.conseil && it.statut !== 'ok' ? raw(html`<br><small class="muted">${it.conseil}</small>`) : ''}</td>
          <td style="white-space:nowrap"><strong>${it.valeur}</strong></td>
          <td>${it.statut ? raw(badge(...TONE[it.statut])) : ''}</td>
          <td><small class="muted">ind. ${it.indicateurs}</small></td></tr>`).join(''))}</tbody></table></div>`).join(''))}`;
    $('[data-depuis]', el).addEventListener('change', (e) => e.target.value && draw(e.target.value));
  };
  await draw(def);
}
