
// ======== CONFIGURATION ========
// Storage provider par défaut : **firebase**
const STORAGE_PROVIDER = "firebase"; 

// IMPORTANT : Renseignez les clés Firebase ci-dessous (Firestore recommandé).
// Console Firebase > Créer un projet > Activer Firestore > Ajouter une app Web et copiez la config ici.
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAH29rfTBpssIurraLagSnE-a1nHRpfVOw",
  authDomain: "gestion-des-stocks-8e1b9.firebaseapp.com",
  projectId: "gestion-des-stocks-8e1b9",
  storageBucket: "gestion-des-stocks-8e1b9.firebasestorage.app",
  messagingSenderId: "217955911455",
  appId: "1:217955911455:web:3120485f9bd8cadb29122a",
  measurementId: "G-VHH73188FZ"
};

// Company & UI
const APP_TITLE = "GESTION DE STOCK — ARTEMIS security (CLOUD)";
const DEFAULT_AGENCIES = [
  "HAUT DE FRANCE", "IDF", "GRAND EST", "RHONE ALPES",
  "PACA", "OCCITANIE", "NOUVELLE AQUITAINE", "AUTRE", "DEPOT"
];
const CATEGORIES = [
  "Uniformes",
  "Tenues EPI",
  "Matériel de communication",
  "Matériel Roulant",
  "Matériel informatique",
  "Licences informatiques",
  "Divers"
];
const SIZES = ["XS","S","M","L","XL","2XL","3XL"]; // Uniformes & EPI, optional per product
