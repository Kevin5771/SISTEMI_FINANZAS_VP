// src/services/secondaryAuth.js
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { firebaseConfig } from './firebase'; 

let secondaryAuth;

export function getSecondaryAuth() {
  // Reutiliza si ya existe
  const name = 'SecondaryApp';
  const existing = getApps().find(a => a.name === name);
  const app = existing || initializeApp(firebaseConfig, name);
  secondaryAuth = secondaryAuth || getAuth(app);
  return secondaryAuth;
}
