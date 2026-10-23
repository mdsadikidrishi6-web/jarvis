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

function setState(state) {
  core.dataset.state = state;
  const labels = { idle: "Idle", listening: "Listening", thinking: "Thinking", speaking: "Speaking" };
  statusEl.textContent = labels[state] || "Idle";
}

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
  setState("idle");
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

/* ---------- Commands + demo replies (Phase 4 mein real AI) ---------- */
function getReply(text) {
  const t = text.toLowerCase();
  if (t.includes("hello") || t.includes("namaste") || t.includes("हैलो") || t.includes("नमस्ते"))
    return "Hello! Main JARVIS hoon (demo mode).";
  if (t.includes("time") || t.includes("samay") || t.includes("समय"))
    return "Abhi samay hai: " + new Date().toLocaleTimeString();
  return "Demo reply: aapne kaha \"" + text + "\". Real AI baad mein judega.";
}

function handleUserText(text) {
  const t = text.toLowerCase();

  if (t === "clear" || t.includes("clear conversation")) {
    chat.innerHTML = "";
    stopSpeaking();
    return;
  }
  if (t.includes("stop speaking") || t === "stop") {
    stopSpeaking();
    return;
  }

  addMessage(text, "user");
  sendBtn.disabled = true;
  setState("thinking");

  setTimeout(() => {
    const reply = getReply(text);
    addMessage(reply, "ai");
    sendBtn.disabled = false;
    setState("idle");
    speak(reply);
  }, 700);
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  handleUserText(text);
});
