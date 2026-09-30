// Page d'impression des documents officiels (ouverte dans un nouvel onglet).
//   #doc=<id>[,<id>...]  → documents émis (données figées)
//   #feuille=<sessionId> → feuille d'émargement (données vivantes)
import './print.css';
import { get } from '../api.js';
import { html, raw } from '../ui.js';
import { TYPE_DOCUMENT } from '../labels.js';
import { qrDataUrl, portailUrl, portailBaseUrl, verificationUrl } from '../qr.js';
import { renderDocument, renderFeuille } from './templates.js';

const toolbar = document.getElementById('toolbar');
const main = document.getElementById('docs');

function parseHash() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const docs = (params.get('doc') || '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => /^\d+$/.test(x));
  const feuille = params.get('feuille');
  return { docs, feuille: feuille && /^\d+$/.test(feuille) ? feuille : null };
}

function afficherBarre(etat = 'pret') {
  toolbar.innerHTML = html`<div class="toolbar-in">
    <button type="button" id="btn-print" class="btn-print" ${etat !== 'pret' ? raw('disabled') : raw('')}>Imprimer / PDF</button>
    <span class="aide">Dans la fenêtre d'impression, choisissez « Enregistrer au format PDF ».</span>
  </div>`;
  document.getElementById('btn-print').addEventListener('click', () => window.print());
}

function afficherErreur(e) {
  const msg =
    e?.status === 401
      ? "Connectez-vous d'abord dans l'application, puis rouvrez ce document."
      : e?.status === 404
        ? 'Document introuvable.'
        : e?.status === 403
          ? "Vous n'avez pas accès à ce document."
          : e?.message || 'Erreur lors du chargement du document.';
  afficherBarre('erreur');
  main.innerHTML = html`<div class="erreur" role="alert">${msg}</div>`;
}

/** Pré-génère les QR codes nécessaires au modèle. */
async function contexteQr(doc) {
  const ctx = {};
  if ((doc.type === 'attestation' || doc.type === 'certificat_realisation') && doc.code_verif) {
    ctx.verifUrl = verificationUrl(doc.code_verif);
    ctx.qrVerif = await qrDataUrl(ctx.verifUrl, 200);
  }
  const token = doc.snapshot?.acces?.token;
  if (doc.type === 'convocation') {
    ctx.portailBase = portailBaseUrl();
    if (token) ctx.qrPortail = await qrDataUrl(portailUrl(token), 220);
  }
  return ctx;
}

/** Attend le chargement des images (logos, signatures, QR) avant d'afficher. */
function imagesChargees(root) {
  const imgs = [...root.querySelectorAll('img')];
  return Promise.all(
    imgs.map((img) =>
      img.complete ? null : new Promise((r) => {
        img.addEventListener('load', r, { once: true });
        img.addEventListener('error', r, { once: true });
      }),
    ),
  );
}

function appliquerOrientation(paysage) {
  document.body.classList.toggle('paysage', paysage);
}

async function charger() {
  const { docs, feuille } = parseHash();
  afficherBarre('chargement');
  main.innerHTML = html`<p class="chargement">Chargement du document…</p>`;
  try {
    let rendus = [];
    let titre = 'Document';
    if (feuille) {
      const data = await get(`/sessions/${feuille}/feuille-emargement`);
      rendus = [renderFeuille(data)];
      titre = `Émargement – ${data.session?.intitule || ''}`;
    } else if (docs.length) {
      const liste = await Promise.all(docs.map((id) => get(`/documents/${id}`)));
      rendus = await Promise.all(liste.map(async (d) => renderDocument(d, await contexteQr(d))));
      titre =
        liste.length === 1
          ? `${TYPE_DOCUMENT[liste[0].type] || 'Document'} ${liste[0].numero || ''}`
          : `${liste.length} documents – ${liste[0].snapshot?.session?.intitule || ''}`;
    } else {
      throw Object.assign(new Error('Aucun document demandé.'), { status: 0 });
    }
    const conteneur = document.createElement('div');
    conteneur.innerHTML = rendus.map((r) => r.html).join('');
    await imagesChargees(conteneur);
    appliquerOrientation(rendus.some((r) => r.paysage));
    main.replaceChildren(...conteneur.childNodes);
    document.title = titre.trim();
    afficherBarre('pret');
  } catch (e) {
    console.error(e);
    afficherErreur(e);
  }
}

window.addEventListener('hashchange', charger);
charger();
