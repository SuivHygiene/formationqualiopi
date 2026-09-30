import { get } from '../api.js';
import { html, raw, badge, emptyState, fmtDate, fmtNum } from '../ui.js';
import { STATUT_SESSION } from '../labels.js';
import { state, canWrite } from '../state.js';

export async function renderDashboard(el, alive = () => true) {
  const d = await get('/dashboard');
  if (!alive()) return;
  const s = d.stats;
  el.innerHTML = html`<div class="page-head"><div><h1>Bonjour ${state.user.prenom}</h1><p class="muted">Activité ${d.annee}</p></div>
    <div class="actions">${canWrite() ? raw('<a class="btn btn-primary" href="#/sessions?nouvelle=1">+ Nouvelle session</a>') : ''}</div></div>
  <div class="grid grid-4" style="margin-bottom:16px">
    ${raw(stat(s.sessions, 'Sessions'))}${raw(stat(s.stagiaires, 'Stagiaires formés'))}
    ${raw(stat(fmtNum(s.heures_stagiaires, 1), 'Heures-stagiaires réalisées'))}
    ${raw(stat(s.satisfaction !== null ? fmtNum(s.satisfaction) + ' / 5' : '—', 'Satisfaction à chaud'))}
  </div>
  <div class="grid grid-2">
    <div class="card"><div class="card-head"><h2>Prochaines sessions</h2><a href="#/sessions">Tout voir</a></div>
      ${raw(d.prochaines_sessions.length ? html`<div class="table-wrap"><table class="table"><tbody>${raw(d.prochaines_sessions.map((x) => html`<tr class="clickable" data-href="#/sessions/${x.id}">
        <td><strong>${x.intitule}</strong><br><small>${x.client_nom || 'Inter / particuliers'} · ${x.lieu || ''}</small></td>
        <td>${fmtDate(x.date_debut)}${x.date_fin && x.date_fin !== x.date_debut ? ' → ' + fmtDate(x.date_fin) : ''}<br><small>${x.nb_inscrits} inscrit(s)</small></td>
        <td>${raw(badge(...STATUT_SESSION[x.statut]))}</td></tr>`).join(''))}</tbody></table></div>` : emptyState('Aucune session à venir.'))}
    </div>
    <div class="card"><div class="card-head"><h2>À traiter</h2>
      <small>${s.reclamations_ouvertes} réclamation(s) · ${s.ameliorations_ouvertes} action(s) d'amélioration ouvertes</small></div>
      ${raw(d.alertes.length ? d.alertes.map((a) => html`<div class="alert alert-${a.niveau}"><span>${a.message}</span>${a.session_id ? raw(html`<a href="#/sessions/${a.session_id}">Ouvrir</a>`) : ''}</div>`).join('') : '<div class="alert alert-ok">Rien à signaler 👍</div>')}
    </div>
  </div>`;
}

function stat(v, l) {
  return html`<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`;
}
