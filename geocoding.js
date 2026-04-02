const fetch = require('node-fetch');

/**
 * Géocode une adresse via Nominatim (OpenStreetMap) — gratuit, sans clé API.
 * @param {string} adresse - adresse complète (ex: "12 rue de la Paix, Paris")
 * @returns {Promise<{lat: number, lng: number} | null>}
 */
async function geocodeAddress(adresse) {
  if (!adresse || !adresse.trim()) return null;

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(adresse)}&limit=1&countrycodes=fr`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MagicBossesApp/1.0 (contact@magicbosses.fr)',
        'Accept-Language': 'fr',
      },
    });

    if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);

    const results = await response.json();
    if (!results || results.length === 0) return null;

    return {
      lat: parseFloat(results[0].lat),
      lng: parseFloat(results[0].lon),
    };
  } catch (e) {
    console.warn('[Geocoding] Erreur:', e.message);
    return null;
  }
}

module.exports = { geocodeAddress };
