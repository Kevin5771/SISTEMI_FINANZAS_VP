// backend/firebaseAdmin.js
const admin = require('firebase-admin');

// Intenta inicializar una sola vez
function initAdmin() {
  if (admin.apps && admin.apps.length) return;

  // 1) Modo A: SERVICE ACCOUNT en una sola variable JSON
  const rawSA = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (rawSA) {
    try {
      const serviceAccount = JSON.parse(rawSA);
      if (typeof serviceAccount.private_key === 'string') {
        // Render/Netlify suelen escapar saltos de línea
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      return;
    } catch (e) {
      console.error('❌ No se pudo parsear FIREBASE_SERVICE_ACCOUNT como JSON:', e.message);
      // seguimos intentando con el modo B
    }
  }

  // 2) Modo B: variables separadas
  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey    = process.env.FIREBASE_PRIVATE_KEY;

  if (privateKey) privateKey = privateKey.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    // No revienta el proceso; deja un error claro
    const missing = [
      !projectId && 'FIREBASE_PROJECT_ID',
      !clientEmail && 'FIREBASE_CLIENT_EMAIL',
      !privateKey && 'FIREBASE_PRIVATE_KEY',
    ].filter(Boolean).join(', ');
    throw new Error(`Faltan variables para Firebase Admin: ${missing} (o define FIREBASE_SERVICE_ACCOUNT).`);
  }

  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
}

try {
  initAdmin();
  // console.log('✅ Firebase Admin inicializado');
} catch (err) {
  console.error('❌ Error inicializando Firebase Admin:', err.message);
  // Propaga el error: el index.js lo atrapará y responderá 500 si hace falta
  throw err;
}

const db = admin.firestore();
// exporta admin (y opcionalmente auth si te gusta como alias)
const auth = admin.auth();

module.exports = { admin, db, auth };
