/* =========================================================================
   FIREBASE SOZLAMALARI / НАСТРОЙКИ FIREBASE
   =========================================================================
   Бу файл барча қурилмалар (телефон, планшет, айпад, ноутбук, компьютер)
   БИР ХИЛ маълумотни кўриши учун керак. localStorage фақат битта браузерда
   ишлайди — шунинг учун умумий онлайн база (Firebase Firestore) ишлатилади.

   ЎРНАТИШ (бир марта, 5 дақиқа, БЕПУЛ):
   1) https://console.firebase.google.com очинг, Google аккаунт билан киринг
   2) "Add project" — лойиҳага ном беринг (масалан: maktab-faceid) — Continue
   3) Google Analytics сўраса — ўчиринг (Enable бўлмаса ҳам бўлади) — Create project
   4) Чап менюдан "Build" -> "Firestore Database" -> "Create database"
      - Location: eu-west (ёки яқин минтақа) -> Next
      - "Start in test mode" ни танланг -> Enable
   5) Чап менюдаги ⚙️ (Project settings) -> "Your apps" -> "</>" (Web) белгисини босинг
      - Ном беринг (масалан: maktab-web) -> Register app
      - Кўринган firebaseConfig обектини қуйидаги firebaseConfig ўрнига қўйинг
   6) Firestore -> Rules бўлимига ўтиб, вақтинча шуни қўйинг (ФАҚАТ мактаб
      ички тизими учун, ошкора сайт эмас):
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /{document=**} {
              allow read, write: if true;
            }
          }
        }
      -> Publish

   Шундан кейин пастдаги firebaseConfig'ни ўзингизникига алмаштиринг ва
   файлни сақланг — index.html ва admin.html иккаласи ҳам шу файлни
   ишлатади, шунинг учун бир жойда созлаш кифоя.
   ========================================================================= */

const firebaseConfig = {
  apiKey: "ВАШ_API_KEY",
  authDomain: "ВАШ_PROJECT.firebaseapp.com",
  projectId: "ВАШ_PROJECT_ID",
  storageBucket: "ВАШ_PROJECT.appspot.com",
  messagingSenderId: "ВАШ_SENDER_ID",
  appId: "ВАШ_APP_ID"
};

let db = null;
let firebaseReady = false;

try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  // Юкланиш тезроқ бўлиши ва интернет вақтинча узилса ҳам ишлаши учун
  // маҳаллий кэшни ёқамиз (қурилма ичида офлайн заҳира сифатида).
  db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
  firebaseReady = true;
} catch (e) {
  console.error("Firebase ulanish xatosi:", e);
  firebaseReady = false;
}

const TEACHERS_COLLECTION = "teachers";
const LOGS_COLLECTION = "attendance_logs";
