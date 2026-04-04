require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Expo } = require('expo-server-sdk');
const db = require('./database');
const { geocodeAddress } = require('./geocoding');

const app = express();
const expo = new Expo();

// Origines autorisées (ton site + app mobile)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false, // permet le chargement du formulaire HTML
}));
app.use(cors({
  origin: (origin, cb) => {
    // Autorise les requêtes sans origin (app mobile, Expo Go, Postman)
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('CORS bloqué'));
  },
}));
app.use(express.json({ limit: '15mb' }));

// Sert le formulaire web (backend/public/formulaire.html)
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

// Route directe pour le formulaire
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'formulaire.html'));
});

// ─── SANTÉ DU SERVEUR ────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'Magic Bosses Backend', timestamp: new Date().toISOString() });
});

// ─── TEST RAPIDE (ouvrir dans le navigateur) ──────────────────────────────────
app.get('/test', async (req, res) => {
  const { geocodeAddress } = require('./geocoding');
  const demande = {
    client_nom: 'Dupont',
    client_prenom: 'Pierre',
    client_telephone: '0612345678',
    client_email: 'pierre@test.fr',
    adresse: '15 rue Victor Hugo, 39000 Lons-le-Saunier',
    creneau: 'Lundi matin',
    type_prestation: 'DSP',
    statut: 'en_attente',
    notes: 'Test automatique',
    lat: null, lng: null,
    raw_data: '{}',
  };
  const coords = await geocodeAddress(demande.adresse).catch(() => null);
  if (coords) { demande.lat = coords.lat; demande.lng = coords.lng; }
  const id = db.createDemande(demande);
  res.json({ ok: true, message: 'Demande de test créée !', id, geocoded: !!coords });
});

// ─── ENREGISTREMENT TOKEN PUSH ───────────────────────────────────────────────
// L'app appelle cette route au démarrage pour enregistrer son token Expo Push.
app.post('/api/push-token', (req, res) => {
  const { token } = req.body;
  if (!token || !Expo.isExpoPushToken(token)) {
    return res.status(400).json({ error: 'Token Expo invalide' });
  }
  db.savePushToken(token);
  console.log('[Push] Token enregistré:', token.slice(0, 30) + '...');
  res.json({ ok: true });
});

// ─── WEBHOOK DEPUIS LE SITE ──────────────────────────────────────────────────
// Le site envoie un POST ici dès qu'un client valide son devis.
// Format attendu (flexible — s'adapte à la structure du site) :
// {
//   client_nom, client_prenom, client_telephone, client_email,
//   adresse, creneau, type_prestation, notes
// }
app.post('/webhook/devis', async (req, res) => {
  try {
    const data = req.body;
    console.log('[Webhook] Nouvelle demande reçue:', JSON.stringify(data).slice(0, 200));

    // Normalisation des champs (plusieurs formats possibles selon le site)
    const demande = {
      client_nom:       data.client_nom || data.nom || data.lastName || '',
      client_prenom:    data.client_prenom || data.prenom || data.firstName || '',
      client_telephone: data.client_telephone || data.telephone || data.phone || '',
      client_email:     data.client_email || data.email || '',
      adresse:          data.adresse || data.address || '',
      creneau:          data.creneau || data.date_souhaitee || data.slot || data.date || '',
      disponibilites:   Array.isArray(data.disponibilites) ? data.disponibilites : null,
      type_prestation:  data.type_prestation || data.type || data.service || 'DSP',
      statut:           'en_attente',
      notes:            data.notes || data.message || '',
      // photo_url = première photo (compat ancien format)
      photo_url:        data.photo_url || data.photoBase64 || (Array.isArray(data.photos) && data.photos[0]) || null,
      // photos = tableau complet (nouveau format)
      photos:           Array.isArray(data.photos) ? data.photos : null,
      lat:              null,
      lng:              null,
    };

    // Géocodage automatique de l'adresse
    if (demande.adresse) {
      console.log('[Geocoding] Géocodage de:', demande.adresse);
      const coords = await geocodeAddress(demande.adresse);
      if (coords) {
        demande.lat = coords.lat;
        demande.lng = coords.lng;
        console.log(`[Geocoding] Résultat: ${coords.lat}, ${coords.lng}`);
      } else {
        console.warn('[Geocoding] Adresse non trouvée:', demande.adresse);
      }
    }

    // Sauvegarde en base
    const id = db.createDemande(demande);
    console.log('[DB] Demande sauvegardée, id:', id);

    // Envoi de la notification push vers l'app
    const tokens = db.getAllPushTokens();
    if (tokens.length > 0) {
      const nom = [demande.client_prenom, demande.client_nom].filter(Boolean).join(' ') || 'Nouveau client';
      const messages = tokens
        .filter(t => Expo.isExpoPushToken(t.token))
        .map(t => ({
          to: t.token,
          sound: 'default',
          title: '🔔 Nouvelle demande de devis',
          body: `${nom} — ${demande.adresse || 'Adresse non renseignée'}`,
          data: { type: 'new_demande', id },
          badge: 1,
        }));

      const chunks = expo.chunkPushNotifications(messages);
      for (const chunk of chunks) {
        try {
          await expo.sendPushNotificationsAsync(chunk);
          console.log('[Push] Notification envoyée');
        } catch (pushErr) {
          console.error('[Push] Erreur envoi:', pushErr.message);
        }
      }
    } else {
      console.log('[Push] Aucun token enregistré — pas de notification');
    }

    res.json({ ok: true, id, geocoded: demande.lat !== null });

  } catch (e) {
    console.error('[Webhook] Erreur:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── RÉCUPÉRATION DES DEMANDES (côté app) ────────────────────────────────────
app.get('/api/demandes', (req, res) => {
  try {
    const demandes = db.getAllDemandes();
    res.json(demandes);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Mise à jour du statut d'une demande
app.put('/api/demandes/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body;
    if (!['en_attente', 'acceptee', 'rejetee'].includes(statut)) {
      return res.status(400).json({ error: 'Statut invalide' });
    }
    db.updateDemandeStatut(parseInt(id), statut);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── DÉMARRAGE ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════╗
║   Magic Bosses Backend — Port ${PORT}    ║
║   Webhook : POST /webhook/devis       ║
║   API     : GET  /api/demandes        ║
║   Health  : GET  /health              ║
╚═══════════════════════════════════════╝
  `);
});
