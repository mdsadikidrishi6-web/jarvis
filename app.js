// ====== SETTINGS ======
// Tumhara Cloudflare Worker ka link (isme API key nahi hai, wo server par safe hai)
const API_URL = "https://jarvis-api.mdsadikidrishi6.workers.dev";

const chat = document.getElementById("chat");
const form = document.getElementById("form");
const input = document.getElementById("text");
const sendBtn = document.getElementById("send");
const core = document.getElementById("core");
const statusEl = document.getElementById("status");
const langSel = document.getElementById("lang");
const voiceOn = document.getElementById("voiceOn");
const stopBtn = document.getElementById("stopSpeak");
const micBtn = document.getElementById("mic");

// Temporary conversation context: sirf is page ke khule rehne tak yaad rehta hai
let history = [];
let busy = false;

function setState(state) {
  core.dataset.state = state;
  const labels = { idle: "Idle", listening: "Listening", thinking: "Thinking", speaking: "Speaking" };
  statusEl.textContent = labels[state] || "Idle";
}

// textContent use karte hain, taaki HTML inject na ho sake
function addMessage(text, who) {
  const div = document.createElement("div");
  div.className = "msg " + who;
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

/* ---------- Text-to-speech ---------- */
const synth = window.speechSynthesis;

function pickVoice(lang) {
  const voices = synth.getVoices();
  const base = lang.split("-")[0];
  return voices.find(v => v.lang === lang) ||
         voices.find(v => v.lang.startsWith(base)) || null;
}

function speak(text) {
  if (!synth || !voiceOn.checked) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = langSel.value;
  const v = pickVoice(langSel.value);
  if (v) u.voice = v;
  u.onstart = () => setState("speaking");
  u.onend = () => setState("idle");
  u.onerror = () => setState("idle");
  synth.speak(u);
}

function stopSpeaking() {
  if (synth) synth.cancel();
  if (!busy) setState("idle");
}
stopBtn.addEventListener("click", stopSpeaking);

if (!synth) {
  addMessage("Is browser mein awaaz (text-to-speech) support nahi hai. Sirf text dikhega.", "sys");
}

/* ---------- Speech recognition ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
let listening = false;

if (!SR) {
  micBtn.disabled = true;
  addMessage("Is browser mein mic (speech recognition) support nahi hai. Chrome use karo, ya type karo.", "sys");
}

function startListening() {
  stopSpeaking();
  rec = new SR();
  rec.lang = langSel.value;
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  rec.onstart = () => {
    listening = true;
    micBtn.classList.add("on");
    setState("listening");
  };
  rec.onresult = (e) => {
    const text = e.results[0][0].transcript.trim();
    if (text) handleUserText(text);
  };
  rec.onerror = (e) => {
    const msgs = {
      "not-allowed": "Mic ki permission deny hai. Chrome mein address bar ke lock icon > Permissions > Microphone > Allow karo.",
      "service-not-allowed": "Mic ki permission deny hai ya is page par mic allowed nahi (HTTPS chahiye).",
      "no-speech": "Kuch sunai nahi diya. Dobara try karo.",
      "audio-capture": "Mic nahi mila. Check karo ki mic kaam kar raha hai.",
      "network": "Speech recognition ke liye internet chahiye. Connection check karo.",
      "language-not-supported": "Ye bhasha is browser mein supported nahi hai."
    };
    addMessage(msgs[e.error] || ("Mic error: " + e.error), "sys");
  };
  rec.onend = () => {
    listening = false;
    micBtn.classList.remove("on");
    if (core.dataset.state === "listening") setState("idle");
  };

  try { rec.start(); }
  catch (err) { addMessage("Mic shuru nahi hua: " + err.message, "sys"); }
}

function stopListening() { if (rec) rec.stop(); }

micBtn.addEventListener("click", () => {
  if (listening) stopListening(); else startListening();
});

/* ---------- Real AI (Worker ke through) ---------- */
async function askAI(text) {
  busy = true;
  sendBtn.disabled = true;
  setState("thinking");
  history.push({ role: "user", text });

  // 25 second se zyada lage to request band kar dete hain
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history.slice(-20), lang: langSel.value }),
      signal: ctrl.signal
    });

    let data = {};
    try { data = await res.json(); } catch (e) { /* JSON nahi mila */ }

    if (!res.ok || !data.reply) {
      throw new Error(data.error || ("Server error (" + res.status + ")"));
    }

    history.push({ role: "ai", text: data.reply });
    addMessage(data.reply, "ai");
    setState("idle");
    speak(data.reply);
  } catch (err) {
    history.pop(); // fail hua message history se hata do
    let msg = err.message;
    if (err.name === "AbortError") {
      msg = "Jawab aane mein bahut der lagi. Dobara try karo.";
    } else if (err instanceof TypeError) {
      msg = "Server tak pahunch nahi paye. Internet check karo, aur app ko GitHub Pages wale link se kholo.";
    }
    addMessage(msg, "sys");
    setState("idle");
  } finally {
    clearTimeout(timer);
    busy = false;
    sendBtn.disabled = false;
  }
}

/* ---------- Commands ---------- */
function handleUserText(text) {
  const t = text.toLowerCase();

  if (t === "clear" || t.includes("clear conversation")) {
    chat.innerHTML = "";
    history = [];
    stopSpeaking();
    return;
  }
  if (t.includes("stop speaking") || t === "stop") {
    stopSpeaking();
    return;
  }
  if (busy) {
    addMessage("Ruko, pichhla jawab abhi aa raha hai.", "sys");
    return;
  }

  addMessage(text, "user");

  // Samay: device ki apni ghadi se (AI ko zarurat nahi)
  if (t.includes("what time") || t.includes("samay kya") || t.includes("समय क्या")) {
    const reply = "Abhi samay hai: " + new Date().toLocaleTimeString();
    addMessage(reply, "ai");
    speak(reply);
    return;
  }

  askAI(text);
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  handleUserText(text);
});

addMessage("Namaste! Main JARVIS hoon. Type karo ya 🎤 dabakar bolo.", "ai");
