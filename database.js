/**
 * Stockage simple en fichiers JSON — pas besoin de Python ni de compilation.
 * Les données sont sauvegardées dans data/demandes.json et data/tokens.json
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR     = path.join(__dirname, 'data');
const DEMANDES_FILE = path.join(DATA_DIR, 'demandes.json');
const TOKENS_FILE   = path.join(DATA_DIR, 'tokens.json');

// Crée le dossier data s'il n'existe pas
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(DEMANDES_FILE)) fs.writeFileSync(DEMANDES_FILE, '[]');
if (!fs.existsSync(TOKENS_FILE))   fs.writeFileSync(TOKENS_FILE,   '[]');

// ─── Lecture / écriture JSON ─────────────────────────────────────────────────
const readJSON  = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// ─── DEMANDES ────────────────────────────────────────────────────────────────
module.exports.createDemande = (data) => {
  const demandes = readJSON(DEMANDES_FILE);
  const newId = demandes.length > 0 ? Math.max(...demandes.map(d => d.id)) + 1 : 1;
  const demande = {
    id: newId,
    ...data,
    created_at: new Date().toISOString(),
  };
  demandes.unshift(demande); // plus récent en premier
  writeJSON(DEMANDES_FILE, demandes);
  return newId;
};

module.exports.getAllDemandes = () => readJSON(DEMANDES_FILE);

module.exports.updateDemandeStatut = (id, statut) => {
  const demandes = readJSON(DEMANDES_FILE);
  const idx = demandes.findIndex(d => d.id === parseInt(id));
  if (idx !== -1) {
    demandes[idx].statut = statut;
    writeJSON(DEMANDES_FILE, demandes);
  }
};

// ─── PUSH TOKENS ─────────────────────────────────────────────────────────────
module.exports.savePushToken = (token) => {
  const tokens = readJSON(TOKENS_FILE);
  if (!tokens.find(t => t.token === token)) {
    tokens.push({ token, created_at: new Date().toISOString() });
    writeJSON(TOKENS_FILE, tokens);
  }
};

module.exports.getAllPushTokens = () => readJSON(TOKENS_FILE);
