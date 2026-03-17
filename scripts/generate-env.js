// Gera src/environments/environment.ts a partir de variáveis de ambiente
const fs = require('node:fs');

const env = {
  production: process.env.NODE_ENV === 'production',
  firebase: {
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || '',
  },
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID || '',
    redirectUri: process.env.SPOTIFY_REDIRECT_URI || '',
  }
};

const content = `export const environment = ${JSON.stringify(env, null, 2)};\n`;

fs.writeFileSync('src/environments/environment.ts', content);
console.log('environment.ts gerado com variáveis de ambiente!');
