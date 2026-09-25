const video = document.getElementById('video');
const resultCard = document.getElementById('result-card');
const checkIcon = document.getElementById('check-icon');
const statusText = document.getElementById('status-text');
const teacherInfo = document.getElementById('teacher-info');
const timeBadge = document.getElementById('time-badge');

let currentLang = 'ru';
let lastRecognizedTeacher = '';
let lastRecognizedTime = 0;
let faceMatcher = null;

const i18n = {
  ru: {
    appTitle: "Средняя школа имени Раджаба Ходжамова",
    lookAtCamera: "Пожалуйста, смотрите в камеру",
    notFound: "Доступ запрещен (Не зарегистрирован)",
    welcome: "Добро пожаловать!",
    lateWarning: "Вы опоздали!",
    subject: "Предмет",
    time: "Время прихода"
  },
  kg: {
    appTitle: "Ражаб Хожамов атындагы орто мектеби",
    lookAtCamera: "Сураныч, камераны караңыз",
    notFound: "Катталган эмес (Кирүүгө болбойт)",
    welcome: "Кош келиңиз!",
    lateWarning: "Сиз кечиктиңиз!",
    subject: "Сабагы",
    time: "Келген убактысы"
  }
};

// "TRING" OVOZ EFFEKTI (Clear Duo-tone chime)
function playTringSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start();
    osc1.stop(audioCtx.currentTime + 0.12);

    setTimeout(() => {
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start();
      osc2.stop(audioCtx.currentTime + 0.25);
    }, 100);
  } catch(e) {
    console.log("Audio error:", e);
  }
}

// Face-API modellarni tezkor yuklash
Promise.all([
  faceapi.nets.ssdMobilenetv1.loadFromUri('https://justadudewhohacks.github.io/face-api.js/models'),
  faceapi.nets.faceLandmark68Net.loadFromUri('https://justadudewhohacks.github.io/face-api.js/models'),
  faceapi.nets.faceRecognitionNet.loadFromUri('https://justadudewhohacks.github.io/face-api.js/models')
]).then(startVideo);

function startVideo() {
  navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: { ideal: 30 } } })
    .then(stream => {
      video.srcObject = stream;
      statusText.innerText = i18n[currentLang].lookAtCamera;
      updateFaceMatcher();
    })
    .catch(err => console.error("Camera error:", err));
}

// Bazadagi yuzlarni xotiraga tayyorlab qo'yish (Tezlikni oshiradi)
async function updateFaceMatcher() {
  const registeredTeachers = JSON.parse(localStorage.getItem('registered_teachers') || '[]');
  if (registeredTeachers.length === 0) return;

  const labeledDescriptors = [];
  for (let teacher of registeredTeachers) {
    if (teacher.photo) {
      try {
        const img = await faceapi.fetchImage(teacher.photo);
        const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
        if (detection) {
          labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(teacher.fullname, [detection.descriptor]));
        }
      } catch (e) {
        console.error("Error loading face descriptor:", e);
      }
    }
  }

  if (labeledDescriptors.length > 0) {
    // distanceThreshold = 0.45 — yuzlarni o'ta aniq taqqoslaydi va adashtirmaydi
    faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.45);
  }
}

video.addEventListener('play', () => {
  const canvas = faceapi.createCanvasFromMedia(video);
  document.querySelector('.camera-container').append(canvas);
  const displaySize = { width: 640, height: 480 };
  faceapi.matchDimensions(canvas, displaySize);

  // Skanerlash har 400ms da ishlaydi (Yuqori tezlik)
  setInterval(async () => {
    if (!faceMatcher) return;

    const detections = await faceapi.detectAllFaces(video)
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
  }, 400);
});

function onFaceRecognized(teacherName) {
  const registeredTeachers = JSON.parse(localStorage.getItem('registered_teachers') || '[]');
  const teacher = registeredTeachers.find(t => t.fullname === teacherName) || { subject: "Учитель" };

  const now = new Date();
  const hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const currentTimeStr = `${hours}:${minutes}`;

  // Soat 08:00 dan keyin kechikkan deb hisoblaydi
  const isLate = hours > 8 || (hours === 8 && minutes > 0);

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

function saveAttendance(name, time, isLate) {
  let logs = JSON.parse(localStorage.getItem('attendance_logs') || '[]');
  const today = new Date().toISOString().split('T')[0];
  
  const alreadyLogged = logs.some(log => log.name === name && log.date === today);
  if (!alreadyLogged) {
    logs.push({ name, date: today, time, isLate });
    localStorage.setItem('attendance_logs', JSON.stringify(logs));
  }
}

function switchLang(lang) {
  currentLang = lang;
  document.getElementById('btn-ru').classList.toggle('active', lang === 'ru');
  document.getElementById('btn-kg').classList.toggle('active', lang === 'kg');
  document.getElementById('app-title').innerText = i18n[lang].appTitle;
  resetCard();
}