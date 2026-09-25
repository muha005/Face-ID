const video = document.getElementById('video');
const resultCard = document.getElementById('result-card');
const checkIcon = document.getElementById('check-icon');
const statusText = document.getElementById('status-text');
const teacherInfo = document.getElementById('teacher-info');
const timeBadge = document.getElementById('time-badge');
const offlineBanner = document.getElementById('offline-banner');

let currentLang = 'ru';
let lastRecognizedTeacher = '';
let lastRecognizedTime = 0;
let faceMatcher = null;
let teachers = [];
let modelsReady = false;

const i18n = {
  ru: {
    appTitle: "Средняя школа имени Раджаба Ходжамова",
    lookAtCamera: "Пожалуйста, смотрите в камеру",
    loading: "Загрузка системы...",
    notFound: "Доступ запрещен (Не зарегистрирован)",
    welcome: "Добро пожаловать!",
    lateWarning: "Вы опоздали!",
    subject: "Предмет",
    time: "Время прихода",
    noCamera: "Нет доступа к камере. Разрешите доступ и обновите страницу.",
    noTeachers: "Список учителей пуст. Обратитесь к администратору.",
    offline: "Нет связи с сервером — работает автономно"
  },
  kg: {
    appTitle: "Ражаб Хожамов атындагы орто мектеби",
    lookAtCamera: "Сураныч, камераны караңыз",
    loading: "Тутум жүктөлүүдө...",
    notFound: "Катталган эмес (Кирүүгө болбойт)",
    welcome: "Кош келиңиз!",
    lateWarning: "Сиз кечиктиңиз!",
    subject: "Сабагы",
    time: "Келген убактысы",
    noCamera: "Камерага уруксат жок. Уруксат берип, баракты жаңыртыңыз.",
    noTeachers: "Мугалимдер тизмеси бош. Администраторго кайрылыңыз.",
    offline: "Сервер менен байланыш жок — оффлайн иштеп жатат"
  }
};

function playTringSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, audioCtx.currentTime);
    osc1.connect(gain1); gain1.connect(audioCtx.destination);
    osc1.start(); osc1.stop(audioCtx.currentTime + 0.12);
    setTimeout(() => {
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, audioCtx.currentTime);
      osc2.connect(gain2); gain2.connect(audioCtx.destination);
      osc2.start(); osc2.stop(audioCtx.currentTime + 0.25);
    }, 100);
  } catch (e) { /* audio not critical */ }
}

// Tez va yengil model: tinyFaceDetector (mobil qurilmalarda ham 1 soniyagacha)
const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights/';

Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
  faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
  faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
]).then(() => {
  modelsReady = true;
  startVideo();
  listenTeachers();
}).catch(err => {
  console.error("Model yuklashda xato:", err);
  statusText.innerText = "Хатолик: тизим юкланмади. Интернетни текширинг.";
});

function startVideo() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    statusText.innerText = i18n[currentLang].noCamera;
    return;
  }
  navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false
  }).then(stream => {
    video.srcObject = stream;
    // iOS Safari uchun majburiy: aks holda kamera to'liq ekranga chiqib
    // ketishi yoki ishlamay qolishi mumkin.
    video.setAttribute('playsinline', true);
    video.setAttribute('webkit-playsinline', true);
    statusText.innerText = i18n[currentLang].lookAtCamera;
  }).catch(err => {
    console.error("Camera error:", err);
    statusText.innerText = i18n[currentLang].noCamera;
  });
}

// O'qituvchilar ro'yxatini serverdan REAL VAQTDA tinglaydi — boshqa
// qurilmadan (masalan admin planshetdan) qo'shilgan o'qituvchi shu zahoti
// shu ekranda ham tanila boshlaydi, sahifani yangilash shart emas.
function listenTeachers() {
  if (!firebaseReady) { statusText.innerText = i18n[currentLang].offline; return; }
  db.collection(TEACHERS_COLLECTION).onSnapshot(async (snapshot) => {
    teachers = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    localStorage.setItem('teachers_cache', JSON.stringify(teachers));
    await updateFaceMatcher();
    if (offlineBanner) offlineBanner.style.display = 'none';
  }, (err) => {
    console.error("Firestore sync error:", err);
    if (offlineBanner) offlineBanner.style.display = 'block';
    // Internet uzilib qolsa - oxirgi saqlangan ro'yxat bilan davom etadi
    const cached = JSON.parse(localStorage.getItem('teachers_cache') || '[]');
    if (cached.length && teachers.length === 0) {
      teachers = cached;
      updateFaceMatcher();
    }
  });
}

async function updateFaceMatcher() {
  if (!modelsReady) return;
  if (teachers.length === 0) {
    faceMatcher = null;
    if (statusText.innerText === i18n[currentLang].lookAtCamera) {
      teacherInfo.innerText = i18n[currentLang].noTeachers;
    }
    return;
  }

  const labeledDescriptors = [];
  for (const teacher of teachers) {
    // Yangi format: photos = [base64, base64, ...] (bir necha rasm — turli
    // kun/kiyim/yorug'lik sharoitida ham tanish aniqligini oshiradi).
    // Eski format bilan orqaga moslik: teacher.photo (bitta rasm) ham qo'llab-quvvatlanadi.
    const photoList = Array.isArray(teacher.photos) && teacher.photos.length
      ? teacher.photos
      : (teacher.photo ? [teacher.photo] : []);
    if (!photoList.length) continue;

    const descriptors = [];
    for (const photoBase64 of photoList) {
      try {
        const img = await faceapi.fetchImage(photoBase64);
        const detection = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 }))
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (detection) descriptors.push(detection.descriptor);
      } catch (e) {
        console.error("Rasmni o'qishda xato:", teacher.fullname, e);
      }
    }
    if (descriptors.length) {
      labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(teacher.fullname, descriptors));
    }
  }

  // distanceThreshold biroz kengroq (0.5) — bir necha rasm bo'lgani uchun
  // kiyim/soch/yorug'lik farqiga chidamliroq, lekin begonani xato tanimaydi.
  faceMatcher = labeledDescriptors.length ? new faceapi.FaceMatcher(labeledDescriptors, 0.5) : null;
}

video.addEventListener('play', () => {
  const container = document.querySelector('.camera-container');
  const canvas = faceapi.createCanvasFromMedia(video);
  container.append(canvas);
  const displaySize = { width: video.clientWidth || 640, height: video.clientHeight || 480 };
  faceapi.matchDimensions(canvas, displaySize);

  const detectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });

  // Tez skanerlash: 200ms — tinyFaceDetector yengil bo'lgani uchun
  // telefon/planshetda ham 1 soniyagacha tanib ulguradi.
  setInterval(async () => {
    if (!modelsReady) return;

    const detection = await faceapi.detectSingleFace(video, detectorOptions)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!canvas.width || canvas.width !== (video.clientWidth || 640)) {
      faceapi.matchDimensions(canvas, { width: video.clientWidth || 640, height: video.clientHeight || 480 });
    }
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

    if (!detection) { resetCard(); return; }

    if (!faceMatcher) { showUnknown(); return; }

    const bestMatch = faceMatcher.findBestMatch(detection.descriptor);

    if (bestMatch.label !== 'unknown') {
      const now = Date.now();
      if (lastRecognizedTeacher !== bestMatch.label || (now - lastRecognizedTime > 4000)) {
        lastRecognizedTeacher = bestMatch.label;
        lastRecognizedTime = now;
        onFaceRecognized(bestMatch.label);
      }
    } else {
      showUnknown();
    }
  }, 200);
});

function onFaceRecognized(teacherName) {
  const teacher = teachers.find(t => t.fullname === teacherName) || { subject: "Учитель" };

  const now = new Date();
  const hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const hoursStr = String(hours).padStart(2, '0');
  const currentTimeStr = `${hoursStr}:${minutes}`;

  const isLate = hours > 8 || (hours === 8 && now.getMinutes() > 0);

  playTringSound();
  checkIcon.innerText = "✅";
  checkIcon.style.display = "block";

  resultCard.className = `result-card ${isLate ? 'late' : 'success'}`;
  statusText.innerText = isLate ? i18n[currentLang].lateWarning : i18n[currentLang].welcome;
  teacherInfo.innerText = `${teacherName} | ${i18n[currentLang].subject}: ${teacher.subject}`;

  timeBadge.style.display = "inline-block";
  timeBadge.innerText = `${i18n[currentLang].time}: ${currentTimeStr}`;

  saveAttendance(teacherName, currentTimeStr, isLate);
}

function showUnknown() {
  resultCard.className = "result-card unknown";
  checkIcon.innerText = "❌";
  checkIcon.style.display = "block";
  statusText.innerText = i18n[currentLang].notFound;
  teacherInfo.innerText = i18n[currentLang].lookAtCamera;
  timeBadge.style.display = "none";
}

function resetCard() {
  resultCard.className = "result-card";
  checkIcon.style.display = "none";
  statusText.innerText = i18n[currentLang].lookAtCamera;
  teacherInfo.innerText = "";
  timeBadge.style.display = "none";
}

// Davomatni umumiy bazaga (barcha qurilmalar ko'radi) va zaxira sifatida
// localStorage'ga ham yozadi (internet uzilib qolsa yo'qolmasligi uchun).
function saveAttendance(name, time, isLate) {
  // YYYY-MM-DD ni LOKAL vaqt bo'yicha hisoblaymiz (UTC emas!) — aks holda
  // tungi soatlarda sana bir kun oldinga/orqaga siljib ketishi mumkin edi.
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const localLogs = JSON.parse(localStorage.getItem('attendance_logs') || '[]');
  const alreadyToday = localLogs.some(log => log.name === name && log.date === today);
  if (alreadyToday) return;

  const entry = { name, date: today, time, isLate };
  localLogs.push(entry);
  localStorage.setItem('attendance_logs', JSON.stringify(localLogs));

  if (firebaseReady) {
    db.collection(LOGS_COLLECTION).add({
      ...entry,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(err => console.error("Davomatni saqlashda xato:", err));
  }
}

function switchLang(lang) {
  currentLang = lang;
  document.getElementById('btn-ru').classList.toggle('active', lang === 'ru');
  document.getElementById('btn-kg').classList.toggle('active', lang === 'kg');
  document.getElementById('app-title').innerText = i18n[lang].appTitle;
  resetCard();
}
