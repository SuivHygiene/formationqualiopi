// Bibliothèque de questionnaires et éditeur de questions.
import { get, post, put, del } from '../api.js';
import { html, raw, $, $$, badge, emptyState, confirmDialog, toast, toastError } from '../ui.js';
import { TYPE_QUESTIONNAIRE, TYPE_QUESTION, opts } from '../labels.js';

export async function renderQuestionnaires(el, alive = () => true) {
  const list = await get('/questionnaires');
  if (!alive()) return;
  const groups = Object.keys(TYPE_QUESTIONNAIRE).map((t) => [t, list.filter((q) => q.type === t)]).filter(([, l]) => l.length);
  el.innerHTML = html`<div class="page-head"><div><h1>Questionnaires</h1><p class="muted">Modèles réutilisables. Ils sont copiés au moment où vous les rattachez à une session : les modifier ensuite ne change pas les réponses déjà recueillies.</p></div>
    <div class="actions"><a class="btn btn-primary" href="#/questionnaires/nouveau">+ Nouveau questionnaire</a></div></div>
    ${groups.length ? raw(groups.map(([t, l]) => html`<div class="card"><h2>${TYPE_QUESTIONNAIRE[t]}</h2><table class="table"><tbody>
      ${raw(l.map((q) => html`<tr class="clickable" data-href="#/questionnaires/${q.id}"><td><strong>${q.titre}</strong><br><small>${q.description || ''}</small></td>
        <td>${q.questions.length} question(s)</td><td>${q.actif ? '' : raw(badge('Archivé'))}</td></tr>`).join(''))}</tbody></table></div>`).join(''))
      : raw(emptyState('Aucun questionnaire.'))}`;
}

const blankQuestion = (type = 'choix_unique') => ({
  id: '', type, libelle: '', obligatoire: true,
  ...(type.startsWith('choix') ? { options: ['', ''], correct: [] } : {}),
});

export async function renderQuestionnaire(el, idOrNew, alive = () => true) {
  const isNew = idOrNew === 'nouveau';
  const [q, formations] = await Promise.all([
    isNew ? Promise.resolve({ titre: '', type: 'evaluation_acquis', description: '', questions: [blankQuestion()], actif: 1, formation_id: null }) : get(`/questionnaires/${idOrNew}`),
    get('/formations'),
  ]);
  if (!alive()) return;
  let dirty = false;

  const draw = () => {
    el.innerHTML = html`<div class="page-head"><div><a href="#/questionnaires" class="muted">← Questionnaires</a><h1>${isNew ? 'Nouveau questionnaire' : q.titre}</h1></div>
      <div class="actions">${!isNew ? raw('<button class="btn" data-dup>Dupliquer</button> <button class="btn btn-ghost" data-del style="color:var(--red)">Supprimer</button>') : ''}
      <button class="btn btn-primary" data-save>Enregistrer</button></div></div>
      <div class="card form-grid">
        <div class="field full"><label>Titre <span class="req">*</span></label><input data-f="titre" value="${q.titre}"></div>
        <div class="field"><label>Type</label><select data-f="type">${raw(opts(TYPE_QUESTIONNAIRE).map(([k, l]) => html`<option value="${k}" ${k === q.type ? raw('selected') : ''}>${l}</option>`).join(''))}</select></div>
        <div class="field"><label>Formation associée (facultatif)</label><select data-f="formation_id"><option value="">— Toutes —</option>${raw(formations.map((f) => html`<option value="${f.id}" ${f.id === q.formation_id ? raw('selected') : ''}>${f.titre}</option>`).join(''))}</select></div>
        <div class="field full"><label>Consigne affichée au stagiaire</label><textarea data-f="description" rows="2">${q.description || ''}</textarea></div>
        <div class="field-check full"><label><input type="checkbox" data-f="actif" ${q.actif ? raw('checked') : ''}> Actif (proposé lors du rattachement aux sessions)</label></div>
      </div>
      ${q.type === 'evaluation_acquis' ? raw('<div class="alert alert-info">Cochez la ou les bonnes réponses : le score est calculé automatiquement et n\'est jamais montré avant l\'envoi.</div>') : ''}
      <div data-questions>${raw(q.questions.map((x, i) => questionCard(x, i, q.questions.length)).join(''))}</div>
      <div class="toolbar"><span>Ajouter :</span>${raw(opts(TYPE_QUESTION).map(([k, l]) => html`<button class="btn btn-small" data-add="${k}">+ ${l}</button>`).join(''))}</div>`;
    bind();
  };

  const questionCard = (x, i, n) => html`<div class="card" data-q="${i}">
    <div class="card-head"><strong>Question ${i + 1} · ${TYPE_QUESTION[x.type]}</strong>
      <div><button class="icon-btn" data-up="${i}" ${i === 0 ? raw('disabled') : ''} aria-label="Monter">↑</button><button class="icon-btn" data-down="${i}" ${i === n - 1 ? raw('disabled') : ''} aria-label="Descendre">↓</button><button class="icon-btn" data-rm="${i}" aria-label="Supprimer">✕</button></div></div>
    <div class="field"><label>Intitulé</label><textarea rows="2" data-k="libelle">${x.libelle}</textarea></div>
    ${x.options ? raw(html`<div style="margin-top:8px"><label>Choix ${q.type === 'evaluation_acquis' ? raw('<small>(cochez la/les bonne(s) réponse(s))</small>') : ''}</label>
      ${raw(x.options.map((o, k) => html`<div style="display:flex;gap:8px;align-items:center;margin-top:6px">
        <input type="${x.type === 'choix_unique' ? 'radio' : 'checkbox'}" name="c${i}" data-correct="${k}" ${(x.correct || []).includes(k) ? raw('checked') : ''} aria-label="Bonne réponse">
        <input data-opt="${k}" value="${o}" placeholder="Choix ${k + 1}"><button class="icon-btn" data-rmopt="${k}" aria-label="Retirer">✕</button></div>`).join(''))}
      <button class="btn btn-small" data-addopt style="margin-top:6px">+ Choix</button>
      ${(x.correct || []).length ? raw('<button class="btn btn-small btn-ghost" data-nocorrect>Aucune bonne réponse (question d\'opinion)</button>') : ''}</div>`) : ''}
    <div class="field-check" style="margin-top:8px"><label><input type="checkbox" data-k="obligatoire" ${x.obligatoire ? raw('checked') : ''}> Réponse obligatoire</label></div>
    <details style="margin-top:6px"><summary class="muted">Explication (affichée dans les résultats)</summary><textarea rows="2" data-k="explication">${x.explication || ''}</textarea></details>
  </div>`;

  const bind = () => {
    $$('[data-f]', el).forEach((inp) => inp.addEventListener('change', () => {
      const k = inp.dataset.f;
      q[k] = inp.type === 'checkbox' ? (inp.checked ? 1 : 0) : inp.value === '' && k === 'formation_id' ? null : inp.value;
      dirty = true;
      if (k === 'type') draw();
    }));
    $$('[data-q]', el).forEach((card) => {
      const i = +card.dataset.q;
      const x = q.questions[i];
      $$('[data-k]', card).forEach((inp) => inp.addEventListener('input', () => {
        x[inp.dataset.k] = inp.type === 'checkbox' ? inp.checked : inp.value;
        dirty = true;
      }));
      $$('[data-opt]', card).forEach((inp) => inp.addEventListener('input', () => { x.options[+inp.dataset.opt] = inp.value; dirty = true; }));
      $$('[data-correct]', card).forEach((inp) => inp.addEventListener('change', () => {
        const k = +inp.dataset.correct;
        if (x.type === 'choix_unique') x.correct = [k];
        else x.correct = inp.checked ? [...new Set([...(x.correct || []), k])] : (x.correct || []).filter((c) => c !== k);
        dirty = true;
        draw();
      }));
      $$('[data-rmopt]', card).forEach((b) => b.addEventListener('click', () => {
        const k = +b.dataset.rmopt;
        x.options.splice(k, 1);
        x.correct = (x.correct || []).filter((c) => c !== k).map((c) => (c > k ? c - 1 : c));
        draw();
      }));
      $('[data-addopt]', card)?.addEventListener('click', () => { x.options.push(''); draw(); });
      $('[data-nocorrect]', card)?.addEventListener('click', () => { x.correct = []; draw(); });
    });
    $$('[data-up]', el).forEach((b) => b.addEventListener('click', () => move(+b.dataset.up, -1)));
    $$('[data-down]', el).forEach((b) => b.addEventListener('click', () => move(+b.dataset.down, 1)));
    $$('[data-rm]', el).forEach((b) => b.addEventListener('click', () => { q.questions.splice(+b.dataset.rm, 1); draw(); }));
    $$('[data-add]', el).forEach((b) => b.addEventListener('click', () => {
      q.questions.push(blankQuestion(b.dataset.add));
      draw();
      $$('[data-q]', el).at(-1)?.scrollIntoView({ behavior: 'smooth' });
    }));
    $('[data-save]', el).addEventListener('click', save);
    $('[data-dup]', el)?.addEventListener('click', async () => {
      try {
        const copy = await post('/questionnaires', payload({ titre: q.titre + ' (copie)' }));
        toast('Copie créée', 'success');
        location.hash = `#/questionnaires/${copy.id}`;
      } catch (e) {
        toastError(e);
      }
    });
    $('[data-del]', el)?.addEventListener('click', async () => {
      if (!(await confirmDialog('Supprimer ce questionnaire ? (Impossible s\'il a déjà été utilisé dans une session : archivez-le.)', { ok: 'Supprimer', danger: true }))) return;
      try {
        await del(`/questionnaires/${q.id}`);
        location.hash = '#/questionnaires';
      } catch (e) {
        toastError(e);
      }
    });
  };

  const move = (i, d) => {
    const [x] = q.questions.splice(i, 1);
    q.questions.splice(i + d, 0, x);
    draw();
  };

  const payload = (over = {}) => ({
    titre: q.titre, type: q.type, description: q.description, actif: !!q.actif, formation_id: q.formation_id || null,
    questions: q.questions.map((x) => ({ ...x, options: x.options?.map((o) => o.trim()).filter(Boolean) })),
    ...over,
  });

  const save = async () => {
    if (!q.titre.trim()) return toast('Donnez un titre', 'error');
    if (!q.questions.length) return toast('Ajoutez au moins une question', 'error');
    try {
      const saved = isNew ? await post('/questionnaires', payload()) : await put(`/questionnaires/${q.id}`, payload());
      dirty = false;
      toast('Questionnaire enregistré', 'success');
      if (isNew) location.hash = `#/questionnaires/${saved.id}`;
      else {
        Object.assign(q, saved);
        draw();
      }
    } catch (e) {
      toastError(e);
    }
  };

  const onLeave = (e) => {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = '';
  };
  window.addEventListener('beforeunload', onLeave);
  window.addEventListener('hashchange', () => window.removeEventListener('beforeunload', onLeave), { once: true });
  draw();
}
