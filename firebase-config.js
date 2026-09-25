// ====== FIREBASE KONFIGURATSIYASI (umumiy fayl, ikkala sahifa ham shundan foydalanadi) ======
const firebaseConfig = {
  apiKey: "AIzaSyDE7AeBnjWJJaLrQNTkoi12NxrTzZ194xU",
  authDomain: "face-id-8fa3e.firebaseapp.com",
  projectId: "face-id-8fa3e",
  storageBucket: "face-id-8fa3e.firebasestorage.app",
  messagingSenderId: "177369780852",
  appId: "1:177369780852:web:4fc0905882a3a52a0ef721"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// XSS'dan himoya uchun: matnni HTML sifatida emas, oddiy matn sifatida chiqarish
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

// Rasmni kichraytirib, siqib beradi (Firestore hujjat hajmi va tezlik uchun)
function resizeImage(file, maxSize = 480, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Файлни ўқиб бўлмади'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Расмни очиб бўлмади'));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round(height * (maxSize / width));
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round(width * (maxSize / height));
          height = maxSize;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Mahalliy (local) sana — UTC emas, qurilmaning o'z vaqt zonasi bo'yicha (kechasi sana surilib ketmasligi uchun)
function getLocalDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getLocalTimeStr(d = new Date()) {
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}
