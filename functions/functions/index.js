const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

// Para probar localmente, crea una función HTTP:
exports.testSendNotifications = functions.https.onRequest(async (req, res) => {
  const now = admin.firestore.Timestamp.fromDate(new Date());
  const snapshot = await db
    .collection('calendarAlerts')
    .where('alertTimestamp', '<=', now)
    .where('notified', '==', false)
    .get();

  if (snapshot.empty) {
    return res.send('No hay alertas pendientes.');
  }

  const batch = db.batch();
  const sendPromises = [];

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const docRef = docSnap.ref;

    if (data.fcmToken) {
      const message = {
        token: data.fcmToken,
        notification: {
          title: `Recordatorio: ${data.title}`,
          body: data.description || 'Tienes una actividad pendiente.'
        }
      };
      sendPromises.push(
        admin.messaging().send(message).catch(err => console.error(err))
      );
    }
    batch.update(docRef, { notified: true });
  });

  await batch.commit();
  await Promise.all(sendPromises);
  res.send('Notificaciones enviadas (o intentado enviar).');
});
