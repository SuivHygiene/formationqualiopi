// Utilitaires d'interface : échappement, formats, toasts, modales, formulaires.

export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Gabarit HTML avec échappement automatique des valeurs (sauf raw()). */
export function html(strings, ...values) {
  return strings.reduce((out, s, i) => {
    if (i >= values.length) return out + s;
    const v = values[i];
    let str;
    if (v && v.__raw) str = v.html;
    else if (Array.isArray(v)) str = v.map((x) => (x && x.__raw ? x.html : esc(x))).join('');
    else str = esc(v);
    return out + s + str;
  }, '');
}

export const raw = (h) => ({ __raw: true, html: h ?? '' });

export function fmtDate(d, opts = {}) {
  if (!d) return '';
  const date = new Date(String(d).length === 10 ? d + 'T12:00:00' : String(d).replace(' ', 'T') + (String(d).length > 10 && !String(d).includes('Z') ? 'Z' : ''));
  if (isNaN(date)) return d;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', ...opts });
}

export function fmtDateLong(d) {
  return fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function fmtDateTime(d) {
  if (!d) return '';
  const date = new Date(String(d).replace(' ', 'T') + 'Z');
  return date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export const fmtHeure = (t) => (t ? String(t).slice(0, 5).replace(':', 'h') : '');

export function fmtNum(n, dec = 2) {
  if (n === null || n === undefined || n === '') return '';
  return Number(n).toLocaleString('fr-FR', { maximumFractionDigits: dec });
}

export function fmtEuro(n) {
  if (n === null || n === undefined || n === '') return '';
  return Number(n).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(message, type = 'info') {
  let box = $('#toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.setAttribute('role', 'status');
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.classList.add('out'), 3500);
  setTimeout(() => el.remove(), 4000);
}

export function toastError(e) {
  toast(e?.message || 'Erreur', 'error');
}

/**
 * Ouvre une modale. content = HTML. Retourne { el, close }.
 * onClose appelé à la fermeture.
 */
export function openModal({ title, content, wide = false, onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = html`<div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${title}">
    <div class="modal-head"><h2>${title}</h2><button type="button" class="icon-btn" data-close aria-label="Fermer">✕</button></div>
    <div class="modal-body">${raw(content)}</div>
  </div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  const close = () => {
    wrap.remove();
    if (!$('.modal-backdrop')) document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && wrap === $$('.modal-backdrop').at(-1)) close();
  };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('mousedown', (e) => {
    if (e.target === wrap) close();
  });
  wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  const first = wrap.querySelector('input:not([type=hidden]), select, textarea');
  setTimeout(() => first?.focus(), 30);
  return { el: wrap, close };
}

export function confirmDialog(message, { ok = 'Confirmer', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal({
      title: 'Confirmation',
      content: html`<p>${message}</p><div class="form-actions"><button class="btn" data-close>Annuler</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${ok}</button></div>`,
      onClose: () => !answered && resolve(false),
    });
    m.el.querySelector('[data-ok]').addEventListener('click', () => {
      answered = true;
      m.close();
      resolve(true);
    });
  });
}

/**
 * Champs de formulaire déclaratifs.
 * field = { name, label, type: text|email|number|date|time|textarea|select|checkbox|color|image, options, required, help, full, rows }
 */
export function formFields(fields, values = {}) {
  return fields
    .map((f) => {
      if (f.section) return html`<h3 class="form-section">${f.section}</h3>`;
      const v = values[f.name] ?? f.default ?? '';
      const id = 'f_' + f.name;
      const req = f.required ? raw(' required') : raw('');
      const label = html`<label for="${id}">${f.label}${f.required ? raw(' <span class="req">*</span>') : raw('')}</label>`;
      let input;
      switch (f.type) {
        case 'textarea':
          input = html`<textarea id="${id}" name="${f.name}" rows="${f.rows || 3}"${req}>${v}</textarea>`;
          break;
        case 'select':
          input = html`<select id="${id}" name="${f.name}"${req}>${raw(
            (f.options || [])
              .map((o) => {
                const [val, lab] = Array.isArray(o) ? o : [o, o];
                return html`<option value="${val}" ${String(val) === String(v ?? '') ? raw('selected') : raw('')}>${lab}</option>`;
              })
              .join(''),
          )}</select>`;
          break;
        case 'checkbox':
          return html`<div class="field field-check ${f.full ? 'full' : ''}"><label><input type="checkbox" name="${f.name}" ${v && v !== '0' ? raw('checked') : raw('')}> ${f.label}</label>${f.help ? raw(html`<small>${f.help}</small>`) : raw('')}</div>`;
        case 'image':
          input = html`<div class="image-field" data-image="${f.name}">
            <input type="hidden" name="${f.name}" value="${v}">
            <img alt="" src="${v || ''}" ${v ? raw('') : raw('hidden')}>
            <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" id="${id}">
            <button type="button" class="btn btn-small" data-clear-image>Retirer</button>
          </div>`;
          break;
        default:
          input = html`<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${v}"${req}${f.step ? raw(` step="${esc(f.step)}"`) : raw('')}${f.placeholder ? raw(` placeholder="${esc(f.placeholder)}"`) : raw('')}>`;
      }
      return html`<div class="field ${f.full || f.type === 'textarea' ? 'full' : ''}">${raw(label)}${raw(input)}${f.help ? raw(html`<small>${f.help}</small>`) : raw('')}<div class="field-error" data-error="${f.name}"></div></div>`;
    })
    .join('');
}

/** Branche les champs image (lecture en data URL, redimensionnement). */
export function bindImageFields(root, maxSize = 600) {
  $$('[data-image]', root).forEach((box) => {
    const hidden = box.querySelector('input[type=hidden]');
    const img = box.querySelector('img');
    box.querySelector('input[type=file]').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const url = await imageToDataUrl(file, maxSize);
        hidden.value = url;
        img.src = url;
        img.hidden = false;
      } catch {
        toast('Image illisible', 'error');
      }
    });
    box.querySelector('[data-clear-image]').addEventListener('click', () => {
      hidden.value = '';
      img.hidden = true;
    });
  });
}

export function imageToDataUrl(file, maxSize) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      if (file.type === 'image/svg+xml') return resolve(reader.result);
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * ratio);
        c.height = Math.round(img.height * ratio);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/** Lit les valeurs d'un formulaire (checkbox → bool, vide → null). */
export function readForm(form, fields) {
  const out = {};
  for (const f of fields) {
    if (f.section) continue;
    const el = form.elements[f.name];
    if (!el) continue;
    if (f.type === 'checkbox') out[f.name] = el.checked;
    else out[f.name] = el.value === '' ? null : el.value;
  }
  return out;
}

export function showFieldErrors(form, err) {
  $$('.field-error', form).forEach((e) => (e.textContent = ''));
  $$('.invalid', form).forEach((e) => e.classList.remove('invalid'));
  for (const [name, msg] of Object.entries(err?.fields || {})) {
    const box = form.querySelector(`[data-error="${name}"]`);
    if (box) box.textContent = msg;
    form.elements[name]?.classList?.add('invalid');
  }
}

/** Ouvre un formulaire en modale ; onSubmit(values) doit renvoyer une promesse. */
export function formModal({ title, fields, values = {}, submitLabel = 'Enregistrer', onSubmit, wide = false, extra = '' }) {
  const m = openModal({
    title,
    wide,
    content: html`<form class="form-grid" novalidate>${raw(formFields(fields, values))}${raw(extra)}
      <div class="form-actions full"><button type="button" class="btn" data-close>Annuler</button><button type="submit" class="btn btn-primary">${submitLabel}</button></div></form>`,
  });
  const form = m.el.querySelector('form');
  bindImageFields(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      await onSubmit(readForm(form, fields), form);
      m.close();
    } catch (err) {
      showFieldErrors(form, err);
      toastError(err);
    } finally {
      btn.disabled = false;
    }
  });
  return m;
}

export function badge(text, tone = 'grey') {
  return html`<span class="badge badge-${tone}">${text}</span>`;
}

export function emptyState(text, action = '') {
  return html`<div class="empty"><p>${text}</p>${raw(action)}</div>`;
}

export function debounce(fn, ms = 250) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}
