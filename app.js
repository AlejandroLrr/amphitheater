// VARIABLES GLOBALES
let peer = null;
let activeConnection = null;
let currentCall = null;
let username = "Usuario";
let roomId = "";
let ytPlayer = null;

// ELEMENTOS DOM
const lobbyScreen = document.getElementById("lobby-screen");
const roomScreen = document.getElementById("room-screen");
const usernameInput = document.getElementById("username-input");
const roomInput = document.getElementById("room-input");
const btnCreate = document.getElementById("btn-create");
const btnLeave = document.getElementById("btn-leave");
const roomBadge = document.getElementById("room-badge");

const ytContainer = document.getElementById("yt-player-container");
const webVideo = document.getElementById("web-video");
const screenVideo = document.getElementById("screen-video");
const placeholder = document.getElementById("media-placeholder");

const btnModeYt = document.getElementById("btn-mode-yt");
const btnModeWeb = document.getElementById("btn-mode-web");
const btnModeScreen = document.getElementById("btn-mode-screen");
const urlBar = document.getElementById("url-bar");
const mediaUrlInput = document.getElementById("media-url-input");
const btnLoadMedia = document.getElementById("btn-load-media");

const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const btnSendChat = document.getElementById("btn-send-chat");

let activeMode = "none"; // 'yt', 'web', 'screen'

// UNIRSE / CREAR SALA
btnCreate.addEventListener("click", () => {
  username = usernameInput.value.trim() || "Anonimo";
  roomId = roomInput.value.trim().toLowerCase();

  if (!roomId) {
    alert("Por favor ingresa un ID para la sala.");
    return;
  }

  initPeerSession();
  lobbyScreen.classList.add("hidden");
  roomScreen.classList.remove("hidden");
  roomBadge.textContent = `Sala: ${roomId}`;
});

btnLeave.addEventListener("click", () => {
  location.reload();
});

// INICIALIZAR PEERJS (P2P CHAT Y PANTALLA)
function initPeerSession() {
  const peerId = `${roomId}-${Math.floor(Math.random() * 1000)}`;
  peer = new Peer(peerId);

  peer.on("open", (id) => {
    appendSystemMessage(`Conectado como ${username}`);
    // Intentar conectar con otros participantes de la sala
    connectToRoom();
  });

  peer.on("connection", (conn) => {
    setupConnection(conn);
  });

  peer.on("call", (call) => {
    call.answer(); // Aceptar transmisión entrante de pantalla
    call.on("stream", (remoteStream) => {
      showMediaSource("screen");
      screenVideo.srcObject = remoteStream;
    });
  });
}

function connectToRoom() {
  // Conectar con el Host de la sala usando el ID
  const targetPeerId = `${roomId}-host`;
  const conn = peer.connect(targetPeerId);
  setupConnection(conn);
}

function setupConnection(conn) {
  activeConnection = conn;
  conn.on("data", (data) => {
    handleIncomingData(data);
  });
}

// MANEJO DE MENSAJES Y DATOS SINCRONIZADOS
function handleIncomingData(data) {
  if (data.type === "chat") {
    appendChatMessage(data.user, data.message);
  } else if (data.type === "media_sync") {
    if (data.mode === "yt") {
      showMediaSource("yt");
      if (ytPlayer && ytPlayer.loadVideoById) {
        ytPlayer.loadVideoById(data.videoId);
      }
    } else if (data.mode === "web") {
      showMediaSource("web");
      webVideo.src = data.url;
      webVideo.play();
    }
  }
}

// ENVIAR CHAT
btnSendChat.addEventListener("click", sendChat);
chatInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendChat();
});

function sendChat() {
  const msg = chatInput.value.trim();
  if (!msg) return;

  appendChatMessage(username, msg, true);
  if (activeConnection) {
    activeConnection.send({ type: "chat", user: username, message: msg });
  }
  chatInput.value = "";
}

function appendChatMessage(user, text, isSelf = false) {
  const div = document.createElement("div");
  div.className = `flex flex-col ${isSelf ? "items-end" : "items-start"}`;
  div.innerHTML = `
    <span class="text-[10px] text-gray-500">${user}</span>
    <div class="${isSelf ? "bg-purple-600 text-white" : "bg-gray-800 text-gray-200"} rounded-lg px-3 py-1.5 max-w-[85%] break-words">
      ${text}
    </div>
  `;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendSystemMessage(text) {
  const div = document.createElement("div");
  div.className = "text-xs text-center text-purple-400 italic my-1";
  div.textContent = text;
  chatMessages.appendChild(div);
}

// CONTROLES DE MEDIOS / PANTALLA
btnModeYt.addEventListener("click", () => {
  activeMode = "yt";
  urlBar.classList.remove("hidden");
  mediaUrlInput.placeholder = "Pega URL de YouTube (ej: https://www.youtube.com/watch?v=...)";
});

btnModeWeb.addEventListener("click", () => {
  activeMode = "web";
  urlBar.classList.remove("hidden");
  mediaUrlInput.placeholder = "Pega URL directa de vídeo (ej: https://.../video.mp4)";
});

btnLoadMedia.addEventListener("click", () => {
  const url = mediaUrlInput.value.trim();
  if (!url) return;

  if (activeMode === "yt") {
    const videoId = extractYTId(url);
    if (videoId) {
      showMediaSource("yt");
      if (ytPlayer) ytPlayer.loadVideoById(videoId);
      if (activeConnection) activeConnection.send({ type: "media_sync", mode: "yt", videoId: videoId });
    } else {
      alert("Enlace de YouTube no válido.");
    }
  } else if (activeMode === "web") {
    showMediaSource("web");
    webVideo.src = url;
    webVideo.play();
    if (activeConnection) activeConnection.send({ type: "media_sync", mode: "web", url: url });
  }
});

// COMPARTIR PANTALLA
btnModeScreen.addEventListener("click", async () => {
  try {
    const mediaStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    showMediaSource("screen");
    screenVideo.srcObject = mediaStream;

    if (activeConnection) {
      peer.call(activeConnection.peer, mediaStream);
    }
  } catch (err) {
    console.error("Error al compartir pantalla:", err);
  }
});

function showMediaSource(source) {
  placeholder.classList.add("hidden");
  ytContainer.classList.add("hidden");
  webVideo.classList.add("hidden");
  screenVideo.classList.add("hidden");

  if (source === "yt") ytContainer.classList.remove("hidden");
  if (source === "web") webVideo.classList.remove("hidden");
  if (source === "screen") screenVideo.classList.remove("hidden");
}

function extractYTId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// CARGAR API DE YOUTUBE
window.onYouTubeIframeAPIReady = function() {
  ytPlayer = new YT.Player("yt-player", {
    height: "100%",
    width: "100%",
    videoId: "",
    playerVars: { autoplay: 1, controls: 1 }
  });
};
