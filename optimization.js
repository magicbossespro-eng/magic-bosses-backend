/**
 * Moteur d'optimisation côté backend — Tournée Intelligente
 * Utilisé par l'API /api/tournee/optimize pour traiter une liste
 * d'interventions transmise par l'app et retourner l'ordre optimal.
 */

function haversine(lat1, lon1, lat2, lon2) {
  const R      = 6371;
  const toRad  = (x) => (x * Math.PI) / 180;
  const dLat   = toRad(lat2 - lat1);
  const dLon   = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function etaTrajetMinutes(distanceKm) {
  return Math.max(2, Math.round((distanceKm / 50) * 60));
}

function estimerDuree(type_bosse, nb_bosses = 1) {
  const base = { simple: 17, moyen: 37, complexe: 75 };
  const dureeBase = base[type_bosse] || 37;
  return dureeBase + Math.max(0, (nb_bosses || 1) - 1) * 10;
}

/**
 * TSP Nearest-Neighbor
 * @param {Array}  interventions — [{id, lat, lng, type_bosse, nb_bosses, temps_estime}]
 * @param {number} startLat
 * @param {number} startLng
 * @returns {Array} ordonnées, enrichies de {ordre, distance_km, eta_trajet_min, temps_estime}
 */
function optimiserOrdre(interventions, startLat = 0, startLng = 0) {
  const avecCoords = interventions.filter(i => i.lat && i.lng);
  const sansCoords = interventions.filter(i => !i.lat || !i.lng);

  const remaining = [...avecCoords];
  const ordered   = [];
  let curLat = startLat;
  let curLng = startLng;

  while (remaining.length > 0) {
    let minDist = Infinity;
    let minIdx  = 0;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(curLat, curLng, remaining[i].lat, remaining[i].lng);
      if (d < minDist) { minDist = d; minIdx = i; }
    }
    const next = remaining.splice(minIdx, 1)[0];
    ordered.push({
      ...next,
      distance_km:    Math.round(minDist * 10) / 10,
      eta_trajet_min: etaTrajetMinutes(minDist),
      temps_estime:   next.temps_estime || estimerDuree(next.type_bosse, next.nb_bosses),
    });
    curLat = next.lat;
    curLng = next.lng;
  }

  return [
    ...ordered,
    ...sansCoords.map((i, idx) => ({
      ...i,
      distance_km:    0,
      eta_trajet_min: 0,
      temps_estime:   i.temps_estime || estimerDuree(i.type_bosse, i.nb_bosses),
    })),
  ].map((item, idx) => ({ ...item, ordre: idx + 1 }));
}

/**
 * Calcule le planning horaire en chaîne depuis une heure de départ.
 */
function calculerPlanning(ordered, heureDebutStr = '08:00') {
  const [hH, hM] = heureDebutStr.split(':').map(Number);
  let minutes = hH * 60 + hM;

  return ordered.map((inter) => {
    minutes += inter.eta_trajet_min || 0;
    const eta = toHHMM(minutes);
    minutes += inter.temps_estime || 45;
    const fin = toHHMM(minutes);
    return { ...inter, eta_arrivee: eta, fin_estimee: fin };
  });
}

function toHHMM(total) {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

module.exports = { optimiserOrdre, calculerPlanning, estimerDuree, haversine };
