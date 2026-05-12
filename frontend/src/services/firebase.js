// src/firebase.js (CRA)
import { initializeApp } from 'firebase/app';
import { getAnalytics } from "firebase/analytics";
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyAwPl1XkcdhuZTXpbJmqALrHhbhc6ANExg",
  authDomain: "finanzas-vp.firebaseapp.com",
  projectId: "finanzas-vp",
  storageBucket: "finanzas-vp.firebasestorage.app",
  messagingSenderId: "569633377367",
  appId: "1:569633377367:web:4a5ec7f9ed6d64196be712",
  measurementId: "G-V05VVF2XNL"
};

const app = initializeApp(firebaseConfig); 
export const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export { signInWithEmailAndPassword, sendPasswordResetEmail };
export { firebaseConfig };
