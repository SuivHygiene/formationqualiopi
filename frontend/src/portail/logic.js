// Logique pure du portail stagiaire (sans DOM ni réseau, sauf readAnswers qui lit un <form>).

export const TOKEN_KEY = 'sf_portail_token';
export const TOKEN_RE = /^[a-f0-9]{64}$/;

/** Extrait le jeton d'un hash « #t=<64 hex> » (null sinon). */
export function tokenFromHash(hash) {
  const m = /(?:^#?|&)t=([a-fA-F0-9]{64})(?:&|$)/.exec(String(hash || '').replace(/^#/, ''));
  return m ? m[1].toLowerCase() : null;
}

/** Normalise un code session saisi : majuscules, alphanumérique, 6 caractères max. */
export function normalizeCodeSession(v) {
  return String(v || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

/** Normalise un code personnel : chiffres uniquement, 6 max. */
export function normalizeCodeAcces(v) {
  return String(v || '')
    .replace(/\D/g, '')
    .slice(0, 6);
}

/** Couleur d'accent sûre (#rgb ou #rrggbb), sinon null. */
export function safeColor(c) {
  const v = String(c || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(v)) return ('#' + [...v.slice(1)].map((x) => x + x).join('')).toLowerCase();
  return null;
}

/** Luminance relative WCAG d'une couleur #rrggbb. */
export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Couleur de texte lisible sur l'accent (blanc si contraste ≥ 4.5, sinon quasi-noir). */
export function onColor(hex) {
  const contrastWhite = 1.05 / (luminance(hex) + 0.05);
  return contrastWhite >= 4.5 ? '#ffffff' : '#111827';
}

/** Libellé de la demi-journée d'après l'heure de début. */
export function periode(heureDebut) {
  const h = parseInt(String(heureDebut || '0').slice(0, 2), 10) || 0;
  if (h < 12) return 'Matin';
  if (h < 18) return 'Après-midi';
  return 'Soirée';
}

/** Regroupe les créneaux par jour (ordre chronologique conservé). */
export function groupCreneauxParJour(creneaux) {
  const sorted = [...(creneaux || [])].sort((a, b) =>
    `${a.date} ${a.heure_debut}`.localeCompare(`${b.date} ${b.heure_debut}`),
  );
  const out = [];
  for (const c of sorted) {
    let g = out.at(-1);
    if (!g || g.date !== c.date) {
      g = { date: c.date, creneaux: [] };
      out.push(g);
    }
    g.creneaux.push(c);
  }
  return out;
}

/**
 * Statut d'affichage d'un créneau.
 * today = 'YYYY-MM-DD' (date locale courante) pour distinguer « pas encore ouvert » / « non signé ».
 */
export function statutCreneau(c, today) {
  if (c.emargement === 'present') return { key: 'signe', label: 'Signé', tone: 'green' };
  if (c.emargement === 'absent') return { key: 'absent', label: 'Absent', tone: 'red' };
  if (c.emargement === 'absent_justifie') return { key: 'absent', label: 'Absence justifiée', tone: 'orange' };
  if (c.signable) return { key: 'a_signer', label: 'À signer', tone: 'blue' };
  // Le serveur indique où l'on se situe par rapport à la fenêtre de signature.
  if (c.fenetre === 'avant') return { key: 'futur', label: 'Pas encore ouvert', tone: 'grey' };
  if (c.fenetre === 'passee') return { key: 'non_signe', label: 'Non signé', tone: 'orange' };
  if (c.date >= today) return { key: 'futur', label: 'Pas encore ouvert', tone: 'grey' };
  return { key: 'non_signe', label: 'Non signé', tone: 'orange' };
}

/** Créneau à mettre en avant : le premier signable. */
export function creneauASigner(creneaux) {
  return (creneaux || []).find((c) => c.signable && !c.emargement) || null;
}

/** Date locale au format YYYY-MM-DD. */
export function todayISO(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Date + heure MySQL UTC (« YYYY-MM-DD HH:MM:SS ») → Date. */
export function parseUtc(s) {
  if (!s) return null;
  const d = new Date(String(s).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z'));
  return isNaN(d) ? null : d;
}

/** « 09h05 » en heure locale pour un horodatage UTC. */
export function heureLocale(s) {
  const d = parseUtc(s);
  if (!d) return '';
  return `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
}

export const ECHELLE = [
  [1, 'Pas du tout'],
  [2, 'Plutôt pas'],
  [3, 'Moyennement'],
  [4, 'Plutôt oui'],
  [5, 'Tout à fait'],
];

export const fieldName = (qid) => 'q_' + qid;

/** Une réponse est vide si null, chaîne blanche ou tableau vide. */
export function isEmptyAnswer(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);
}

/**
 * Convertit les valeurs brutes du formulaire (chaînes) en réponses typées pour l'API.
 * raw = { questionId: string | string[] | null }
 */
export function buildAnswers(questions, rawValues) {
  const out = {};
  for (const q of questions || []) {
    const v = rawValues[q.id];
    switch (q.type) {
      case 'choix_multiple': {
        const arr = (Array.isArray(v) ? v : v == null || v === '' ? [] : [v])
          .map((x) => parseInt(x, 10))
          .filter((x) => Number.isInteger(x));
        out[q.id] = [...new Set(arr)].sort((a, b) => a - b);
        break;
      }
      case 'choix_unique':
      case 'echelle': {
        const n = v == null || v === '' ? null : parseInt(v, 10);
        out[q.id] = Number.isInteger(n) ? n : null;
        break;
      }
      case 'oui_non':
        out[q.id] = v === 'oui' || v === 'true' || v === true ? true : v === 'non' || v === 'false' || v === false ? false : null;
        break;
      default:
        out[q.id] = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
    }
  }
  return out;
}

/** Lit les valeurs brutes d'un <form> (champs nommés q_<id>). */
export function readRawValues(form, questions) {
  const raw = {};
  for (const q of questions || []) {
    const name = fieldName(q.id);
    if (q.type === 'choix_multiple') {
      raw[q.id] = [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
    } else if (q.type === 'texte') {
      raw[q.id] = form.querySelector(`[name="${name}"]`)?.value ?? '';
    } else {
      raw[q.id] = form.querySelector(`input[name="${name}"]:checked`)?.value ?? null;
    }
  }
  return raw;
}

export function readAnswers(form, questions) {
  return buildAnswers(questions, readRawValues(form, questions));
}

/** Erreurs de validation côté client : { questionId: message }. */
export function validateAnswers(questions, answers) {
  const errors = {};
  for (const q of questions || []) {
    const v = answers[q.id];
    if (q.obligatoire && isEmptyAnswer(v)) errors[q.id] = 'Obligatoire';
    else if (q.type === 'echelle' && v != null && (v < 1 || v > 5)) errors[q.id] = 'Note de 1 à 5';
    else if (q.type === 'texte' && typeof v === 'string' && v.length > 5000) errors[q.id] = '5000 caractères maximum';
  }
  return errors;
}

/** Retire les réponses vides (non obligatoires) avant envoi. */
export function compactAnswers(answers) {
  return Object.fromEntries(Object.entries(answers).filter(([, v]) => !isEmptyAnswer(v)));
}

/** Code de vérification : 16 caractères alphanumériques (minuscules). */
export function normalizeVerifCode(v) {
  return String(v || '')
    .trim()
    .replace(/^#/, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}
export const isVerifCode = (c) => /^[a-z0-9]{16}$/.test(c);
