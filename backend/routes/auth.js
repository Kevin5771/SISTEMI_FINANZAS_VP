// backend/routes/auth.js
const router = require('express').Router();
const { admin, db } = require('../firebaseAdmin');
const jwt = require('jsonwebtoken');

const APP_SECRET = process.env.APP_SECRET || 'cambia-esto';

// ---- Helpers básicos ----
function getBearerToken(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : null;
}
const lower = (s) => (s || '').toString().trim().toLowerCase();

// Lee doc de usuarios por UID
async function getUserDocByUid(uid) {
  try {
    const snap = await db.collection('usuarios').doc(uid).get();
    if (!snap.exists) return null;
    const d = snap.data() || {};
    return {
      role: lower(d.role || d.rol || (d.isAdmin ? 'admin' : '')),
      disabled: !!d.disabled,
      username: d.username,
      email: d.email,
    };
  } catch (e) {
    console.warn('getUserDocByUid error:', e.message);
    return null;
  }
}

// Busca doc por email (intenta emailLower si existe en tu modelo)
async function getUserDocByEmailExact(email) {
  const emailLower = lower(email);
  try {
    // a) Si guardas emailLower en tus docs:
    const byLower = await db.collection('usuarios')
      .where('emailLower', '==', emailLower)
      .limit(1)
      .get();
    if (!byLower.empty) {
      const d = byLower.docs[0].data() || {};
      return {
        role: lower(d.role || d.rol || (d.isAdmin ? 'admin' : '')),
        disabled: !!d.disabled,
        username: d.username,
        email: d.email,
      };
    }
  } catch (e) {
    // si falla, seguimos con la b)
    console.warn('getUserDocByEmailExact (emailLower) error:', e.message);
  }

  try {
    // b) Fallback: campo email exacto (case-sensitive)
    const qs = await db.collection('usuarios').where('email', '==', email).limit(1).get();
    if (!qs.empty) {
      const d = qs.docs[0].data() || {};
      return {
        role: lower(d.role || d.rol || (d.isAdmin ? 'admin' : '')),
        disabled: !!d.disabled,
        username: d.username,
        email: d.email,
      };
    }
  } catch (e) {
    console.warn('getUserDocByEmailExact (email) error:', e.message);
  }
  return null;
}

// Resuelve rol/disabled (UID -> email -> fallback ADMIN_EMAILS -> viewer)
async function resolveRoleAndDisabled({ uid, email }) {
  // 1) por UID
  const byUid = await getUserDocByUid(uid);
  if (byUid) {
    const role = (byUid.role === 'admin' || byUid.role === 'viewer') ? byUid.role : '';
    return { role: role || '', disabled: !!byUid.disabled };
  }

  // 2) por email
  const byEmail = await getUserDocByEmailExact(email);
  if (byEmail) {
    const role = (byEmail.role === 'admin' || byEmail.role === 'viewer') ? byEmail.role : '';
    return { role: role || '', disabled: !!byEmail.disabled };
  }

  // 3) fallback ADMIN_EMAILS
  const admins = (process.env.ADMIN_EMAILS || '').split(',').map(lower).filter(Boolean);
  if (admins.includes(lower(email))) return { role: 'admin', disabled: false };

  // 4) default
  return { role: 'viewer', disabled: false };
}

// Sincroniza el custom claim { admin: true/false } preservando otros claims
async function syncAdminClaim(uid, shouldBeAdmin) {
  try {
    const u = await admin.auth().getUser(uid);
    const current = !!(u.customClaims && u.customClaims.admin);
    const desired = !!shouldBeAdmin;
    if (current === desired) return false; // sin cambios

    const nextClaims = { ...(u.customClaims || {}), admin: desired };
    await admin.auth().setCustomUserClaims(uid, nextClaims);
    return true;
  } catch (e) {
    console.warn('syncAdminClaim error:', e.message);
    return false;
  }
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const idToken = getBearerToken(req) || req.body?.idToken;
  if (!idToken) return res.status(400).json({ message: 'Falta idToken' });

  try {
    // Verificamos el ID token de Firebase
    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;
    const email = decoded.email || '';

    // Obtenemos role/disabled desde Firestore/env
    const { role, disabled } = await resolveRoleAndDisabled({ uid, email });
    if (disabled) return res.status(403).json({ message: 'Cuenta deshabilitada' });

    // Sincroniza claim admin según el rol resuelto
    await syncAdminClaim(uid, role === 'admin');

    // Firmamos JWT de la app
    const token = jwt.sign({ uid, email, role }, APP_SECRET, { expiresIn: '8h' });
    return res.json({ token, role });
  } catch (e) {
    console.error('POST /auth/login error:', e.message);
    return res.status(401).json({ message: 'Token de Firebase inválido' });
  }
});

module.exports = router;
