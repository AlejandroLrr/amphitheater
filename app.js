// CONFIGURACIÓN DE FIREBASE (Base de datos en tiempo real)
const firebaseConfig = {
  databaseURL: "https://amphitheater-rave-default-rtdb.firebaseio.com"
};

// Inicializar Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// VARIABLES GLOBALES Y DE ESTADO
let currentUser = "";
let currentRoom = "";
let ytPlayer = null;
let roomRef = null;
let isSettingStateLocally = false;

// ELEMENTOS DOM
const lobby = document.getElementById("lobby");
const inputUsername = document.getElementById("input-username");
const inputRoom = document.getElementById("input-room");
const btnEnter = document.getElementById("btn-enter");
const badgeRoom = document.getElementById("badge-room");
const btnShareLink = document.getElementById("btn-share-link");

const ytContainer = document.getElementById("yt-container");
const webPlayer = document.getElementById("web-player");
const emptyState = document.getElementById("empty-state");

const inputMediaUrl = document.getElementById("input-media-url");
const btnChangeVideo = document.getElementById("btn-change-video");

const chatMessages = document.getElementById("chat-messages");
const inputChat = document.getElementById("input-chat");
const btnSendChat = document.getElementById("btn-send-chat");

// AUTO-DETECCIÓN DE SALA EN LA URL (?room=...)
window.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get("room");
  if (roomParam) {
    inputRoom.value = roomParam;
  }
});

// UNIRSE O CREAR SALA EN AMPHITHEATER
btnEnter.addEventListener("click", joinRoom);

function joinRoom() {
  currentUser = inputUsername.value.trim() || "Anónimo";
  currentRoom = inputRoom.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");

  if (!currentRoom) {
    alert("Ingresa un nombre de sala válido.");
    return;
  }

  badgeRoom.textContent = `Sala: ${currentRoom}`;
  lobby.classList.add("hidden");

  // Escuchar nodo de la sala en Firebase
  roomRef = db.ref(`rooms/${currentRoom}`);
  listenRoomUpdates();

  // Saludo del Agente de IA (AmphiBot)
  setTimeout(() => {
    sendBotMessage(`¡Hola ${currentUser}! 👋 Te doy la bienvenida a Amphitheater. Soy AmphiBot, la IA anfitriona de la sala. Puedes hablar conmigo escribiendo @amphi o pedirme que configure la sala.`);
  }, 1000);
}

// COPIAR ENLACE DIRECTO A LA SALA
btnShareLink.addEventListener("click", () => {
  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoom}`;
  navigator.clipboard.writeText(shareUrl);
  alert("¡Enlace de Amphitheater copiado al portapapeles!");
});

// YOUTUBE IFRAME API READY
window.onYouTubeIframeAPIReady = function() {
  ytPlayer = new YT.Player("yt-player", {
    height: "100%",
    width: "100%",
    videoId: "5qap5aO4i9A", // Video inicial por defecto
    playerVars: { autoplay: 0, controls: 1 },
    events: {
      'onStateChange': onPlayerStateChange
    }
  });
};

function onPlayerStateChange(event) {
  if (isSettingStateLocally || !roomRef) return;
  
  if (event.data === YT.PlayerState.PLAYING) {
    roomRef.child("playback").update({
      state: "play",
      time: ytPlayer.getCurrentTime(),
      updatedBy: currentUser
    });
  } else if (event.data === YT.PlayerState.PAUSED) {
    roomRef.child("playback").update({
      state: "pause",
      time: ytPlayer.getCurrentTime(),
      updatedBy: currentUser
    });
  }
}

// CARGAR NUEVO VIDEO EN LA SALA
btnChangeVideo.addEventListener("click", () => {
  const url = inputMediaUrl.value.trim();
  if (!url) return;
  loadMediaUrl(url);
  inputMediaUrl.value = "";
});

function loadMediaUrl(url) {
  const ytId = extractYTId(url);
  if (ytId) {
    roomRef.child("playback").set({
      type: "yt",
      videoId: ytId,
      state: "play",
      time: 0,
      updatedBy: currentUser
    });
  } else {
    roomRef.child("playback").set({
      type: "web",
      url: url,
      state: "play",
      time: 0,
      updatedBy: currentUser
    });
  }
}

// ESCUCHAR EVENTOS DE FIREBASE
function listenRoomUpdates() {
  // Sincronizar estado del reproductor
  roomRef.child("playback").on("value", (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    isSettingStateLocally = true;

    if (data.type === "yt") {
      ytContainer.classList.remove("hidden");
      webPlayer.classList.add("hidden");
      emptyState.classList.add("hidden");

      if (ytPlayer && ytPlayer.loadVideoById) {
        const currentVideoId = ytPlayer.getVideoData() ? ytPlayer.getVideoData().video_id : null;
        if (currentVideoId !== data.videoId) {
          ytPlayer.loadVideoById(data.videoId, data.time || 0);
        }
        
        if (data.state === "play") ytPlayer.playVideo();
        else if (data.state === "pause") ytPlayer.pauseVideo();
      }
    } else if (data.type === "web") {
      ytContainer.classList.add("hidden");
      webPlayer.classList.remove("hidden");
      emptyState.classList.add("hidden");

      if (webPlayer.src !== data.url) {
        webPlayer.src = data.url;
      }
      if (data.state === "play") webPlayer.play();
      else webPlayer.pause();
    }

    setTimeout(() => { isSettingStateLocally = false; }, 500);
  });

  // Sincronizar chat e interacción con AmphiBot
  roomRef.child("chat").on("child_added", (snapshot) => {
    const msg = snapshot.val();
    appendChatMessage(msg.user, msg.text);

    // Si el mensaje es de un usuario y menciona al bot de IA
    if (msg.user !== "🤖 AmphiBot" && isBotMentioned(msg.text)) {
      handleBotResponse(msg.user, msg.text);
    }
  });
}

// ENVIAR Y MOSTRAR MENSAJES DE CHAT
btnSendChat.addEventListener("click", sendChat);
inputChat.addEventListener("keypress", (e) => { if (e.key === "Enter") sendChat(); });

function sendChat() {
  const text = inputChat.value.trim();
  if (!text || !roomRef) return;

  roomRef.child("chat").push({
    user: currentUser,
    text: text,
    timestamp: Date.now()
  });

  inputChat.value = "";
}

function sendBotMessage(text) {
  if (!roomRef) return;
  roomRef.child("chat").push({
    user: "🤖 AmphiBot",
    text: text,
    timestamp: Date.now()
  });
}

function appendChatMessage(user, text) {
  const isSelf = user === currentUser;
  const isBot = user === "🤖 AmphiBot";
  const div = document.createElement("div");
  div.className = `flex flex-col ${isSelf ? "items-end" : "items-start"}`;
  
  let bgClass = "bg-slate-800 text-slate-200 border border-slate-700/50";
  if (isSelf) bgClass = "bg-purple-600 text-white";
  if (isBot) bgClass = "bg-gradient-to-r from-indigo-900 to-purple-900 text-purple-200 border border-purple-500/30";

  div.innerHTML = `
    <span class="text-[10px] text-slate-500 font-medium px-1">${user}</span>
    <div class="${bgClass} rounded-2xl px-3.5 py-2 max-w-[85%] break-words shadow-sm text-sm">
      ${text}
    </div>
  `;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// LÓGICA DEL AGENTE DE IA (AMPHIBOT)
function isBotMentioned(text) {
  const lower = text.toLowerCase();
  return lower.includes("@amphi") || lower.includes("amphibot") || lower.includes("bot,") || lower.includes("bot ");
}

function handleBotResponse(user, userText) {
  const cleanText = userText.toLowerCase();

  // Comandos de reproductor vía IA
  if (cleanText.includes("pon ") || cleanText.includes("reproduce ") || cleanText.includes("cambia a ")) {
    if (cleanText.includes("http://") || cleanText.includes("https://")) {
      const urlMatch = userText.match(/(https?:\/\/[^\s]+)/g);
      if (urlMatch && urlMatch[0]) {
        loadMediaUrl(urlMatch[0]);
        sendBotMessage(`¡Entendido ${user}! He cargado el enlace directamente en el reproductor de Amphitheater. 🎬`);
        return;
      }
    } else {
      sendBotMessage(`¡Excelente opción, ${user}! Pega el enlace de YouTube o MP4 en la barra inferior para reproducirlo en la sala.`);
      return;
    }
  }

  // Respuestas conversacionales de anfitrión
  const botResponses = [
    `¡Hola ${user}! Qué gran ambiente hay en Amphitheater hoy. 🎧`,
    `¡Totalmente! Estoy listo para lo que deseen ver a continuación en la sala. ✨`,
    `¡Aquí reportándome! Como IA anfitriona de Amphitheater, quedo atento a cualquier comando o sugerencia. 🎬`,
    `¡Me encanta esa idea! Recuerda que puedes enviarme o pegar cualquier enlace para reproducirlo juntos.`
  ];

  const randomReply = botResponses[Math.floor(Math.random() * botResponses.length)];
  setTimeout(() => {
    sendBotMessage(randomReply);
  }, 800);
}

function extractYTId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}
