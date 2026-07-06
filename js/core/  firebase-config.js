// firebase-config.js
// Linde Guia — Treze Tílias
//
// Inicialização ÚNICA do Firebase. Todo outro arquivo que precisa falar
// com Firestore ou Auth importa "db" / "auth" daqui — nunca chama
// initializeApp() de novo em outro lugar do projeto.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getAnalytics,
  isSupported as analyticsIsSupported,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";

// Configuração do projeto no Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyCg6wbwHsvxPDPI0VnBIR30d6aVzhYB49Q",
  authDomain: "linde-guia.firebaseapp.com",
  projectId: "linde-guia",
  storageBucket: "linde-guia.firebasestorage.app",
  messagingSenderId: "961192250688",
  appId: "1:961192250688:web:f5e4366bb60c931224bea5",
  measurementId: "G-SN7PJJK3SY",
};

// Inicializa o app Firebase
const app = initializeApp(firebaseConfig);

// Firestore — usado por pois-data.js, eventos-data.js, admin-pois.js
const db = getFirestore(app);

// Auth — usado por auth.js (perfil.html, favoritos, "Minhas Rotas")
const auth = getAuth(app);

// Analytics — só roda no browser (proteção pra não quebrar em build/SSR/testes Node)
let analytics = null;
if (typeof window !== "undefined") {
  analyticsIsSupported()
    .then((suportado) => {
      if (suportado) {
        analytics = getAnalytics(app);
      }
    })
    .catch((erro) => {
      console.warn("[firebase-config] Analytics não inicializado:", erro);
    });
}

export { app, db, auth, analytics };
