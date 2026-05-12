// public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBL8onIxodd41sUUc8r9JLQg4lLwGPSmzc",
  authDomain: "grafica-ventas.firebaseapp.com",
  projectId: "grafica-ventas",
  storageBucket: "grafica-ventas.firebasestorage.app",
  messagingSenderId: "841964521076",
  appId: "1:841964521076:web:67d2d9d155924e92eeb321",
  measurementId: "G-QE8FMBLSL0"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  console.log('Mensaje recibido en segundo plano:', payload);
  self.registration.showNotification(payload.notification.title, {
    body: payload.notification.body,
    icon: '/icon.png'
  });
});
