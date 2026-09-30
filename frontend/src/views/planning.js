// Fonctions pures liées au planning (testées).

/** Regroupe des créneaux {date, heure_debut, ...} par jour, triés. */
export function groupByDay(creneaux) {
  const map = new Map();
  [...creneaux]
    .sort((a, b) => (a.date + a.heure_debut).localeCompare(b.date + b.heure_debut))
    .forEach((c) => {
      if (!map.has(c.date)) map.set(c.date, []);
      map.get(c.date).push(c);
    });
  return [...map.entries()].map(([date, list]) => ({ date, creneaux: list }));
}

/** « Matin », « Après-midi » ou « Soir » selon l'heure de début. */
export function periodeLabel(c) {
  const h = parseInt(String(c.heure_debut).slice(0, 2), 10);
  if (h < 12) return 'Matin';
  if (h < 18) return 'Après-midi';
  return 'Soir';
}

/**
 * Génère les créneaux matin/après-midi entre deux dates (incluses).
 * opts = { matin: ['09:00','12:30'] | null, apresMidi: ['13:30','17:00'] | null, weekends: false }
 */
export function generateCreneaux(from, to, { matin, apresMidi, weekends = false }) {
  const out = [];
  const start = new Date(from + 'T12:00:00Z');
  const end = new Date((to || from) + 'T12:00:00Z');
  if (isNaN(start) || isNaN(end) || end < start) return out;
  for (let d = new Date(start), n = 0; d <= end && n < 370; d.setUTCDate(d.getUTCDate() + 1), n++) {
    const dow = d.getUTCDay();
    if (!weekends && (dow === 0 || dow === 6)) continue;
    const date = d.toISOString().slice(0, 10);
    for (const slot of [matin, apresMidi]) {
      if (slot && slot[0] && slot[1] && slot[1] > slot[0]) out.push({ date, heure_debut: slot[0], heure_fin: slot[1] });
    }
  }
  return out;
}
