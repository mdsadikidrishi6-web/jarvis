// ====== SETTINGS ======
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
  // Devanagari (Hindi) text ho to Hindi awaaz, warna selected language
  const lang = /[\u0900-\u097F]/.test(text) ? "hi-IN" : langSel.value;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  const v = pickVoice(lang);
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
    history.pop();
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

/* ---------- Voice commands (browser ke andar chalne wale) ---------- */
const JOKES = [
  "Teacher ne poocha: homework kahan hai? Student bola: Sir, cloud mein tha, network chala gaya.",
  "Why do programmers prefer dark mode? Because light attracts bugs.",
  "Doctor ne kaha roz 10 kilometre chalo. Ek hafte baad patient ne phone kiya: Doctor sahab, ab main aapse 70 kilometre door hoon."
];

// Sirf ye do sites khulne dete hain
function safeUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === "https:" &&
      (x.hostname === "www.google.com" || x.hostname === "www.youtube.com");
  } catch (e) { return false; }
}

function reply(text) {
  addMessage(text, "ai");
  speak(text);
}

// Link kholne se pehle poochta hai: Haan / Nahi
function askConfirm(question, url) {
  if (!safeUrl(url)) {
    addMessage("Ye link allowed nahi hai.", "sys");
    return;
  }
  const box = document.createElement("div");
  box.className = "msg sys";
  const p = document.createElement("div");
  p.textContent = question;
  p.style.marginBottom = "8px";
  const yes = document.createElement("button");
  yes.type = "button"; yes.className = "ghost"; yes.textContent = "Haan, kholo";
  yes.style.marginRight = "8px";
  const no = document.createElement("button");
  no.type = "button"; no.className = "ghost"; no.textContent = "Nahi";

  yes.addEventListener("click", () => {
    yes.disabled = true; no.disabled = true;
    const w = window.open(url, "_blank", "noopener");
    if (!w) addMessage("Browser ne naya tab block kar diya. Is site ke liye popups allow karo.", "sys");
  });
  no.addEventListener("click", () => {
    yes.disabled = true; no.disabled = true;
    p.textContent = "Theek hai, cancel kar diya.";
  });

  box.append(p, yes, no);
  chat.appendChild(box);
  chat.scrollTop = chat.scrollHeight;
  speak(question);
}

// True return kare to command handle ho gaya (AI ko nahi bhejna)
function runCommand(raw) {
  const t = raw.toLowerCase().trim().replace(/[.!?।]+$/, "");

  // Greeting
  if (/^(hello|hi|hey|namaste|नमस्ते|हैलो|हेलो)(\s+(jarvis|जार्विस|जारविस))?$/.test(t)) {
    reply("Namaste! Main JARVIS hoon. Bataiye, kya madad karun?");
    return true;
  }

  // Samay
  if (t.includes("what time") || t.includes("what's the time") || t.includes("what is the time") ||
      t.includes("samay kya") || t.includes("time kya") || t.includes("समय क्या")) {
    reply("Abhi samay hai: " + new Date().toLocaleTimeString());
    return true;
  }

  // Joke
  if (t.includes("joke") || t.includes("चुटकुला")) {
    reply(JOKES[Math.floor(Math.random() * JOKES.length)]);
    return true;
  }

    // Open Google / YouTube (Hindi/English, alag-alag spelling ke saath)
  const c = t.replace(/\s+/g, "");   // spaces hata ke match karte hain
  const wantsOpen = /(^|\s)(open|ओपन)(\s|$)|खोल|kholo|khol\b|चालू|chalu/.test(t);
  const YT_NAMES = ["youtube", "utube", "यूट्यूब", "युट्यूब", "युटुब", "यूटूब", "यूटयूब"];
  const G_NAMES = ["google", "गूगल", "गुगल"];

  if (wantsOpen) {
    if (YT_NAMES.some(n => c.includes(n))) {
      askConfirm("YouTube kholna hai? Naye tab mein khulega.", "https://www.youtube.com/");
      return true;
    }
    if (G_NAMES.some(n => c.includes(n))) {
      askConfirm("Google kholna hai? Naye tab mein khulega.", "https://www.google.com/");
      return true;
    }
  }

  // Search
  const m = t.match(/^(?:search for|search|सर्च फॉर|सर्च फोर|सर्च)\s+(.+)$/) ||
            t.match(/^(.+?)\s+(?:search karo|search kar do|search kar|khojo|सर्च करो|सर्च कर दो|सर्च कर|खोजो|खोज)$/);
  if (m) {
    const q = m[1].trim().slice(0, 200);
    if (q) {
      const url = "https://www.google.com/search?q=" + encodeURIComponent(q);
      askConfirm("Google par \"" + q + "\" search karun? Naye tab mein khulega.", url);
      return true;
    }
  }

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
  if (runCommand(text)) return;   // local command ho to yahin khatam
  askAI(text);                    // warna AI se poocho
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  handleUserText(text);
});

addMessage("Namaste! Main JARVIS hoon. Type karo ya 🎤 dabakar bolo.", "ai");
