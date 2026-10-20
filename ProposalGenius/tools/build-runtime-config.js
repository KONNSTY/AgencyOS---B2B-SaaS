// Generates the public Firebase web config from the server-side deployment
// environment. Firebase web config is intentionally public; no Admin key or
// other server secret may be written by this script.

const fs = require('fs');
const path = require('path');

const config = {
    apiKey: process.env.FIREBASE_WEB_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'polymath-productions.firebaseapp.com',
    projectId: process.env.FIREBASE_PROJECT_ID || 'polymath-productions',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'polymath-productions.firebasestorage.app',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '11186161755',
    appId: process.env.FIREBASE_WEB_APP_ID || '1:11186161755:web:adff3a2546534e6737577e',
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || 'G-0ML0NWH05Z'
};

if (!config.apiKey) {
    throw new Error('FIREBASE_WEB_API_KEY fehlt; Runtime-Konfiguration wird nicht erzeugt.');
}

const outputPath = path.join(__dirname, '..', 'public', 'firebase-runtime-config.js');
const tempPath = `${outputPath}.tmp`;
const contents = `window.firebaseConfig = Object.freeze(${JSON.stringify(config)});\n`;

fs.writeFileSync(tempPath, contents, { encoding: 'utf8', mode: 0o644 });
fs.renameSync(tempPath, outputPath);
console.log('Firebase-Web-Konfiguration erzeugt (Werte nicht geloggt).');
