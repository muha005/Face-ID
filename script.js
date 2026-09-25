const video = document.getElementById('video');
const resultCard = document.getElementById('result-card');
const checkIcon = document.getElementById('check-icon');
const statusText = document.getElementById('status-text');
const teacherInfo = document.getElementById('teacher-info');
const timeBadge = document.getElementById('time-badge');
const hintText = document.getElementById('hint-text');

let currentLang = 'ru';
let lastRecognizedTeacher = '';
let lastRecognizedTime = 0;
let faceMatcher = null;
let teachers = [];   // Firestore'dan real vaqtda keladi
let todayLoggedNames = new Set(); // bugun allaqachon belgilangan ismlar (keraksiz yozuvlarni oldini olish uchun)
let modelsReady = false;
let matcherBuilding = false;

const i18n = {
  ru: {
    appTitle: "Средняя школа имени Раджаба Ходжамова",
    lookAtCamera: "Пожалуйста, смотрите в камеру",
    notFound: "Доступ запрещен (Не зарегистрирован)",
    welcome: "Добро пожаловать!",
    lateWarning: "Вы опоздали!",
    subject: "Предмет",
    time: "Время прихода",
    loading: "Загрузка системы...",
    camError: "Нет доступа к камере",
    camErrorHint: "Разрешите доступ к камере в настройках браузера и обновите страницу.",
    httpsHint: "Если камера не открывается — сайт должен быть открыт по HTTPS-адресу, а не как локальный файл.",
    noTeachers: "Нет зарегистрированных учителей",
    connError: "Ошибка соединения с базой"
  },
  kg: {
    appTitle: "Ражаб Хожамов атындагы орто мектеби",
    lookAtCamera: "Сураныч, камераны караңыз",
    notFound: "Катталган эмес (Кирүүгө болбойт)",
    welcome: "Кош келиңиз!",
    lateWarning: "Сиз кечиктиңиз!",
    subject: "Сабагы",
    time: "Келген убактысы",
    loading: "Тутум жүктөлүүдө...",
    camError: "Камерага мүмкүнчүлүк жок",
    camErrorHint: "Браузер орнотууларынан камерага уруксат бериңиз жана баракты жаңыртыңыз.",
    httpsHint: "Эгер камера ачылбаса — сайт локалдык файл эмес, HTTPS дареги менен ачылышы керек.",
    noTeachers: "Каттоодон өткөн мугалим жок",
    connError: "Базага туташуу катасы"
  }
};

function playTringSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, audioCtx.currentTime);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start();
    osc1.stop(audioCtx.currentTime + 0.12);

    setTimeout(() => {
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, audioCtx.currentTime);
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start();
      osc2.stop(audioCtx.currentTime + 0.25);
    }, 100);
  } catch (e) {
    console.log("Audio error:", e);
  }
}

// Tezroq va yengil model: tinyFaceDetector (ssdMobilenetv1 o'rniga — bir necha soniya emas, taxminan yarim soniyada aniqlaydi)
const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
const DETECT_OPTIONS = new Promise(resolve => {
  // faceapi yuklangandan keyin chaqiriladi, pastda o'rnatiladi
  resolve(null);
});

Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
  faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
  faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
]).then(() => {
  modelsReady = true;
  startVideo();
  listenToTeachers();
}).catch(err => {
  console.error("Model yuklashda xato:", err);
  showFatalError(i18n[currentLang].connError, "Face-api моделлари юкланмади. Интернетни текширинг.");
});

function getTinyOptions() {
  return new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
}

function startVideo() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showFatalError(i18n[currentLang].camError, i18n[currentLang].httpsHint);
    return;
  }
  navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } })
    .then(stream => {
      video.srcObject = stream;
      statusText.innerText = i18n[currentLang].lookAtCamera;
      hintText.innerText = '';
    })
    .catch(err => {
      console.error("Camera error:", err);
      showFatalError(i18n[currentLang].camError, i18n[currentLang].camErrorHint + ' ' + i18n[currentLang].httpsHint);
    });
}

function showFatalError(title, hint) {
  resultCard.className = "result-card error";
  checkIcon.style.display = "none";
  statusText.innerText = title;
  teacherInfo.innerText = '';
  timeBadge.style.display = "none";
  hintText.innerText = hint || '';
}

// O'qituvchilar ro'yxatini Firestore'dan REAL VAQTDA tinglaydi.
// Boshqa qurilmada (masalan admin panelda) yangi o'qituvchi qo'shilsa — bu yerda sahifani yangilamasdan avtomatik yangilanadi.
function listenToTeachers() {
  db.collection('teachers').onSnapshot(snapshot => {
    teachers = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    rebuildFaceMatcher();
  }, err => {
    console.error("Firestore xatosi:", err);
    showFatalError(i18n[currentLang].connError, 'Firestore қоидаларини текширинг (Firebase консол → Firestore → Rules).');
  });

  // Bugun allaqachon belgilanganlarni bilib turish uchun (takroriy yozuvni oldini olish, o'qishlarni kamaytirish)
  const today = getLocalDateStr();
  db.collection('attendance_logs').where('date', '==', today).onSnapshot(snapshot => {
    todayLoggedNames = new Set(snapshot.docs.map(d => d.data().name));
  });
}

async function rebuildFaceMatcher() {
  if (!modelsReady || matcherBuilding) return;
  matcherBuilding = true;

  if (teachers.length === 0) {
    faceMatcher = null;
    matcherBuilding = false;
    return;
  }

  const labeledDescriptors = [];
  for (const teacher of teachers) {
    if (!teacher.photo) continue;
    try {
      const img = await faceapi.fetchImage(teacher.photo);
      const detection = await faceapi.detectSingleFace(img, getTinyOptions()).withFaceLandmarks().withFaceDescriptor();
      if (detection) {
        labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(teacher.fullname, [detection.descriptor]));
      }
    } catch (e) {
      console.error("Дескриптор ҳисоблашда хато (" + teacher.fullname + "):", e);
    }
  }

  faceMatcher = labeledDescriptors.length > 0 ? new faceapi.FaceMatcher(labeledDescriptors, 0.45) : null;
  matcherBuilding = false;
}

video.addEventListener('play', () => {
  const canvas = faceapi.createCanvasFromMedia(video);
  document.querySelector('.camera-container').append(canvas);
  const displaySize = { width: video.videoWidth || 640, height: video.videoHeight || 480 };
  faceapi.matchDimensions(canvas, displaySize);

  // Tez skanerlash: yengil model bo'lgani uchun 300ms'da ham muammosiz ishlaydi
  setInterval(async () => {
    if (!modelsReady) return;

    if (!faceMatcher) {
      if (teachers.length === 0) {
        resultCard.className = "result-card";
        statusText.innerText = i18n[currentLang].noTeachers;
        teacherInfo.innerText = '';
      }
      return;
    }

    const detections = await faceapi.detectAllFaces(video, getTinyOptions())
      .withFaceLandmarks()
      .withFaceDescriptors();

    const resizedDetections = faceapi.resizeResults(detections, displaySize);
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

    if (resizedDetections.length > 0) {
      const bestMatch = faceMatcher.findBestMatch(resizedDetections[0].descriptor);

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
    } else {
      resetCard();
    }
  }, 300);
});

function onFaceRecognized(teacherName) {
  const teacher = teachers.find(t => t.fullname === teacherName) || { subject: "Учитель" };

  const now = new Date();
  const currentTimeStr = getLocalTimeStr(now);
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const isLate = hours > 8 || (hours === 8 && minutes > 0);

  playTringSound();
  checkIcon.innerText = "✅";
  checkIcon.style.display = "block";

  resultCard.className = `result-card ${isLate ? 'late' : 'success'}`;
  statusText.innerText = isLate ? i18n[currentLang].lateWarning : i18n[currentLang].welcome;
  teacherInfo.innerText = `${teacherName} | ${i18n[currentLang].subject}: ${teacher.subject}`;

  timeBadge.style.display = "inline-block";
  timeBadge.innerText = `${i18n[currentLang].time}: ${currentTimeStr}`;

  saveAttendance(teacherName, currentTimeStr, isLate, now);
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

// Davomatni Firestore'ga yozadi — barcha qurilmalarda darhol ko'rinadi.
// Bir kunda bir marta yoziladi (mahalliy keshdan tekshiriladi, keraksiz yozuvni oldini oladi).
function saveAttendance(name, time, isLate, dateObj) {
  const today = getLocalDateStr(dateObj);
  if (todayLoggedNames.has(name)) return;
  todayLoggedNames.add(name); // darhol belgilab qo'yamiz — tez-tez bosilsa ham qayta yozilmasin

  db.collection('attendance_logs').add({
    name,
    date: today,
    time,
    isLate,
    ts: dateObj.getTime(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(err => {
    console.error("Давоматни сақлашда хато:", err);
    todayLoggedNames.delete(name); // xato bo'lsa qayta urinish imkoni bo'lsin
  });
}

function switchLang(lang) {
  currentLang = lang;
  document.getElementById('btn-ru').classList.toggle('active', lang === 'ru');
  document.getElementById('btn-kg').classList.toggle('active', lang === 'kg');
  document.getElementById('app-title').innerText = i18n[lang].appTitle;
  resetCard();
}
