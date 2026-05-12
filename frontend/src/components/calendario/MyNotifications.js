// src/MyNotifications.jsx
import React, { useEffect, useState } from 'react';
import { messaging, getToken, onMessage } from '../../firebase';

export default function MyNotifications() {
  const [token, setToken] = useState('');

  useEffect(() => {
    // Solicitar permisos y obtener token
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        getToken(messaging, { vapidKey: "TU_PUBLIC_VAPID_KEY" })
          .then(currentToken => {
            if (currentToken) {
              setToken(currentToken);
              console.log("Tu FCM Token:", currentToken);
              // Guarda este token en Firestore o envíalo a tu servidor
            } else {
              console.log("No se generó el token FCM");
            }
          })
          .catch(err => {
            console.error("Error al obtener token:", err);
          });
      } else {
        console.log("Permiso para notificaciones denegado");
      }
    });

    // Recibir mensajes en primer plano
    onMessage(messaging, payload => {
      console.log("Notificación recibida en primer plano:", payload);
      new Notification(payload.notification.title, {
        body: payload.notification.body,
        icon: "/icon.png"
      });
    });

  }, []);

  return (
    <div>
      <h3>Token FCM:</h3>
      <p style={{ wordWrap: "break-word" }}>{token || "Solicitando token..."}</p>
    </div>
  );
}
