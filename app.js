// ====== SETTINGS ======
const API_URL = "https://jarvis-api.mdsadikidrishi6.workers.dev";
const PREFS_KEY = "jarvis_prefs_v1";
const HIST_KEY = "jarvis_history_v1";
const NOTES_KEY = "jarvis_notes_v1";
const MAX_ITEMS = 100;

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
const gear = document.getElementById("gear");
const settingsEl = document.getElementById("settings");
const rateInput = document.getElementById("rate");
const rateVal = document.getElementById("rateVal");
const saveHistBox = document.getElementById("saveHist");
const wipeBtn = document.getElementById("wipe");
const closeBtn = document.getElementById("closeSettings");
const titleEl = document.getElementById("title");
const nameIn = document.getElementById("nameIn");
const personaSel = document.getElementById("persona");
const notesBtn = document.getElementById("notesBtn");
const notesEl = document.getElementById("notes");
const todoForm = document.getElementById("todoForm");
const todoIn = document.getElementById("todoIn");
const todoList = document.getElementById("todoList");
const noteForm = document.getElementById("noteForm");
const noteIn = document.getElementById("noteIn");
const noteList = document.getElementById("noteList");
const closeNotes = document.getElementById("closeNotes");
const studyBtn = document.getElementById("studyBtn");
const studyEl = document.getElementById("study");
const closeStudy = document.getElementById("closeStudy");

// Temporary context: page khula hai tab tak. History save ON ho to storage mein bhi.
let history = [];
let busy = false;
const PERSONAS = ["friendly", "teacher", "short", "funny", "neet"];
let prefs = { rate: 1, save: false, name: "JARVIS", persona: "friendly" };

// Naam: sirf akshar, number aur space, max 20
function cleanName(s) {
  const n = String(s || "").replace(/[^\p{L}\p{N} ]/gu, "").trim().slice(0, 20);
  return n || "JARVIS";
}

// Header aur tab ka title naam ke hisaab se badalta hai
function applyName() {
  if (titleEl) titleEl.textContent = prefs.name;
  document.title = prefs.name;
}

/* ---------- Storage (har jagah try/catch, kyunki storage fail ho sakta hai) ---------- */
function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY));
    if (p && typeof p === "object") {
      prefs.rate = Math.min(1.5, Math.max(0.6, Number(p.rate) || 1));
      prefs.save = p.save === true;
      prefs.name = cleanName(p.name);
      prefs.persona = PERSONAS.includes(p.persona) ? p.persona : "friendly";
    }
  } catch (e) { /* kuch save nahi tha */ }
}
function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {}
}
function saveHistory() {
  if (!prefs.save) return;               // consent nahi to kuch save nahi hota
  try { localStorage.setItem(HIST_KEY, JSON.stringify(history.slice(-40))); } catch (e) {}
}
function loadHistory() {
  try {
    const h = JSON.parse(localStorage.getItem(HIST_KEY));
    if (Array.isArray(h)) {
      return h
        .filter(m => m && (m.role === "user" || m.role === "ai") && typeof m.text === "string")
        .slice(-40)
        .map(m => ({ role: m.role, text: m.text.slice(0, 1000) }));
    }
  } catch (e) {}
  return [];
}
function removeHistory() {
  try { localStorage.removeItem(HIST_KEY); } catch (e) {}
}

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
  const lang = /[\u0900-\u097F]/.test(text) ? "hi-IN" : langSel.value;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = prefs.rate;
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
      body: JSON.stringify({ messages: history.slice(-20), lang: langSel.value, name: prefs.name, persona: prefs.persona }),
      signal: ctrl.signal
    });

    let data = {};
    try { data = await res.json(); } catch (e) { /* JSON nahi mila */ }

    if (!res.ok || !data.reply) {
      throw new Error(data.error || ("Server error (" + res.status + ")"));
    }

    history.push({ role: "ai", text: data.reply });
    saveHistory();
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

/* ---------- Notes aur To-do (sirf is browser mein save) ---------- */
let store = { todos: [], notes: [] };

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function loadStore() {
  try {
    const d = JSON.parse(localStorage.getItem(NOTES_KEY));
    if (d && typeof d === "object") {
      if (Array.isArray(d.todos)) {
        store.todos = d.todos
          .filter(x => x && typeof x.text === "string")
          .slice(0, MAX_ITEMS)
          .map(x => ({ id: String(x.id || newId()), text: x.text.slice(0, 200), done: x.done === true }));
      }
      if (Array.isArray(d.notes)) {
        store.notes = d.notes
          .filter(x => x && typeof x.text === "string")
          .slice(0, MAX_ITEMS)
          .map(x => ({ id: String(x.id || newId()), text: x.text.slice(0, 500) }));
      }
    }
  } catch (e) { /* kuch save nahi tha */ }
}

function saveStore() {
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(store));
    return true;
  } catch (e) {
    addMessage("Save nahi ho paya. Browser storage band ya full ho sakta hai.", "sys");
    return false;
  }
}

function makeRow(text, onDelete, onToggle, done) {
  const li = document.createElement("li");
  if (onToggle) {
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = done;
    cb.setAttribute("aria-label", "Task poora hua");
    cb.addEventListener("change", onToggle);
    li.appendChild(cb);
  }
  const span = document.createElement("span");
  span.textContent = text;            // textContent: HTML inject nahi ho sakta
  if (done) span.className = "done";
  li.appendChild(span);
  const del = document.createElement("button");
  del.type = "button";
  del.className = "ghost x";
  del.textContent = "✕";
  del.setAttribute("aria-label", "Delete karo");
  del.addEventListener("click", onDelete);
  li.appendChild(del);
  return li;
}

function renderNotes() {
  if (!todoList || !noteList) return;
  todoList.innerHTML = "";
  noteList.innerHTML = "";

  if (!store.todos.length) {
    const li = document.createElement("li");
    li.className = "empty"; li.textContent = "Koi task nahi.";
    todoList.appendChild(li);
  }
  store.todos.forEach(item => {
    todoList.appendChild(makeRow(item.text,
      () => { store.todos = store.todos.filter(x => x.id !== item.id); saveStore(); renderNotes(); },
      () => { item.done = !item.done; saveStore(); renderNotes(); },
      item.done));
  });

  if (!store.notes.length) {
    const li = document.createElement("li");
    li.className = "empty"; li.textContent = "Koi note nahi.";
    noteList.appendChild(li);
  }
  store.notes.forEach(item => {
    noteList.appendChild(makeRow(item.text,
      () => { store.notes = store.notes.filter(x => x.id !== item.id); saveStore(); renderNotes(); },
      null, false));
  });
}

function addTodo(text) {
  const t = String(text || "").trim().slice(0, 200);
  if (!t) return false;
  if (store.todos.length >= MAX_ITEMS) {
    addMessage("Task list full hai (" + MAX_ITEMS + "). Pehle kuch delete karo.", "sys");
    return false;
  }
  store.todos.push({ id: newId(), text: t, done: false });
  const ok = saveStore();
  renderNotes();
  return ok;
}

function addNote(text) {
  const t = String(text || "").trim().slice(0, 500);
  if (!t) return false;
  if (store.notes.length >= MAX_ITEMS) {
    addMessage("Notes full hain (" + MAX_ITEMS + "). Pehle kuch delete karo.", "sys");
    return false;
  }
  store.notes.push({ id: newId(), text: t });
  const ok = saveStore();
  renderNotes();
  return ok;
}

function openNotes() {
  if (settingsEl) settingsEl.hidden = true;
  if (studyEl) studyEl.hidden = true;
  if (notesEl) { renderNotes(); notesEl.hidden = false; }
}

if (notesBtn) notesBtn.addEventListener("click", openNotes);
if (closeNotes) closeNotes.addEventListener("click", () => { notesEl.hidden = true; });
if (todoForm) todoForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (addTodo(todoIn.value)) todoIn.value = "";
});
if (noteForm) noteForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (addNote(noteIn.value)) noteIn.value = "";
});

/* ---------- NEET Study panel ---------- */
function openStudy() {
  if (settingsEl) settingsEl.hidden = true;
  if (notesEl) notesEl.hidden = true;
  if (studyEl) studyEl.hidden = false;
}
if (studyBtn) studyBtn.addEventListener("click", openStudy);
if (closeStudy) closeStudy.addEventListener("click", () => { studyEl.hidden = true; });
if (studyEl && studyEl.querySelectorAll) {
  studyEl.querySelectorAll("[data-cmd]").forEach(b => {
    b.addEventListener("click", () => {
      const cmd = b.getAttribute("data-cmd");
      studyEl.hidden = true;
      handleUserText(cmd);
    });
  });
}

function setPersona(p) {
  prefs.persona = PERSONAS.includes(p) ? p : "friendly";
  savePrefs();
  if (personaSel) personaSel.value = prefs.persona;
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
  const g = t.match(/^(hello|hi|hey|namaste|नमस्ते|हैलो|हेलो)(?:\s+(.+))?$/);
  if (g) {
    const rest = (g[2] || "").trim();
    const nm = prefs.name.toLowerCase();
    if (!rest || rest === nm || rest === "jarvis" || rest === "जार्विस" || rest === "जारविस") {
      reply("Namaste! Main " + prefs.name + " hoon. Bataiye, kya madad karun?");
      return true;
    }
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

  // NEET study commands: AI ko ek saaf instruction bhejte hain
  const modeOn = t.match(/^(?:neet|study|नीट)\s+(?:mode|मोड)(?:\s+on)?$/);
  if (modeOn) {
    setPersona("neet");
    reply("NEET mode on. Ab main padhai ke tutor ki tarah jawab dunga.");
    return true;
  }
  if (/^(?:normal|friendly|नॉर्मल)\s+(?:mode|मोड)$/.test(t)) {
    setPersona("friendly");
    reply("Normal mode on.");
    return true;
  }
  const qz = t.match(/^(?:neet\s+)?quiz(?:$|[\s:\-]+(?:(?:on|of|for|par|pe)\s+)?(.*)$)/) ||
             t.match(/^(?:क्विज\u093C?)(?:$|\s+(.*)$)/);
  if (qz) {
    const topic = (qz[1] || "").trim().slice(0, 100);
    const prompt = topic
      ? "NEET 2027 level ka ek MCQ poochho. Topic: " + topic + ". Sirf sawal aur 4 options (A, B, C, D) likho. Sahi jawab abhi mat batao, mere jawab ka intezaar karo."
      : "NEET 2027 level ka ek MCQ poochho (Physics, Chemistry ya Biology mein se koi bhi). Sirf sawal aur 4 options (A, B, C, D) likho. Sahi jawab abhi mat batao, mere jawab ka intezaar karo.";
    askAI(prompt);
    return true;
  }
  if (/^(?:neet\s+)?(?:revision plan|रिवीजन प्लान|रिविजन प्लान)(?:\s+.*)?$/.test(t)) {
    askAI("Mera NEET 2027 ka revision plan banao. Pehle mujhse 2 chhote sawal poochho: kitne din ya mahine bache hain, aur kaun se subjects weak hain. Phir plan do.");
    return true;
  }

  // Notes / To-do panel kholna
  if (/^(?:show|open|dikhao|शो|ओपन|दिखाओ)\s+(?:my\s+|मेरे\s+)?(?:notes?|todos?|to-do|to do|tasks?|list|नोट(?:्स)?|टू डू|टूडू|टास्क)$/i.test(t) ||
      /^(?:मेरे\s+|my\s+)?(?:notes?|todos?|to-do|to do|tasks?|नोट(?:्स)?|टू डू|टूडू|टास्क)\s+(?:dikhao|dikha do|kholo|दिखाओ|दिखा दो|खोलो|देखो)$/i.test(t)) {
    openNotes();
    reply("Notes aur to-do panel khol diya.");
    return true;
  }

  // Note save karna (original spelling/case ke saath)
  const r = raw.trim().replace(/[.!?।]+$/, "");
  const nm = r.match(/^(?:note karo|note kar do|note kar|add note|new note|नोट करो|नोट कर दो|नोट कर|नोट)(?:\s*[:\-]\s*|\s+)(.+)$/i) ||
             r.match(/^note\s*[:\-]\s*(.+)$/i) ||
             r.match(/^(.+?)\s+(?:note karo|note kar do|नोट करो|नोट कर लो)$/i);
  if (nm) {
    if (addNote(nm[1])) {
      const shown = nm[1].trim().slice(0, 60);
      reply("Note save ho gaya: " + shown);
    }
    return true;
  }

  // To-do add karna
  const tm = r.match(/^(?:add todo|add to-do|add to do|add task|new task|new todo|todo|to-do|टू डू जोड़ो|टूडू जोड़ो|टास्क जोड़ो|टू डू|टूडू|टास्क)(?:\s*[:\-]\s*|\s+)(.+)$/i) ||
             r.match(/^(.+?)\s+(?:todo mein add karo|task add karo|to do mein daalo|टू डू में जोड़ो)$/i);
  if (tm) {
    if (addTodo(tm[1])) {
      const shown = tm[1].trim().slice(0, 60);
      reply("Task add ho gaya: " + shown);
    }
    return true;
  }

  // Open Google / YouTube (Hindi/English, alag-alag spelling ke saath)
  const c = t.replace(/\s+/g, "");
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

  return false;
}

function handleUserText(text) {
  const t = text.toLowerCase();

  if (t === "clear" || t.includes("clear conversation")) {
    chat.innerHTML = "";
    history = [];
    removeHistory();
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
  if (runCommand(text)) return;
  askAI(text);
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  handleUserText(text);
});

/* ---------- Settings panel ---------- */
function openSettings() {
  rateInput.value = prefs.rate;
  rateVal.textContent = Number(prefs.rate).toFixed(1);
  saveHistBox.checked = prefs.save;
  if (nameIn) nameIn.value = prefs.name;
  if (personaSel) personaSel.value = prefs.persona;
  if (notesEl) notesEl.hidden = true;
  if (studyEl) studyEl.hidden = true;
  settingsEl.hidden = false;
}
gear.addEventListener("click", openSettings);
closeBtn.addEventListener("click", () => { settingsEl.hidden = true; });

rateInput.addEventListener("input", () => {
  prefs.rate = Math.min(1.5, Math.max(0.6, Number(rateInput.value) || 1));
  rateVal.textContent = prefs.rate.toFixed(1);
  savePrefs();
});

saveHistBox.addEventListener("change", () => {
  prefs.save = saveHistBox.checked;
  savePrefs();
  if (prefs.save) saveHistory(); else removeHistory();   // OFF karte hi saved history hat jati hai
});

if (nameIn) nameIn.addEventListener("change", () => {
  prefs.name = cleanName(nameIn.value);
  nameIn.value = prefs.name;
  savePrefs();
  applyName();
});

if (personaSel) personaSel.addEventListener("change", () => {
  prefs.persona = PERSONAS.includes(personaSel.value) ? personaSel.value : "friendly";
  savePrefs();
});

wipeBtn.addEventListener("click", () => {
  if (!confirm("Saved history, settings, notes aur to-do delete kar dun? Ye wapas nahi aayega.")) return;
  try { localStorage.removeItem(PREFS_KEY); localStorage.removeItem(HIST_KEY); localStorage.removeItem(NOTES_KEY); } catch (e) {}
  store = { todos: [], notes: [] };
  renderNotes();
  prefs = { rate: 1, save: false, name: "JARVIS", persona: "friendly" };
  applyName();
  history = [];
  chat.innerHTML = "";
  openSettings();
  addMessage("Saara saved data delete ho gaya.", "sys");
});

/* ---------- Start ---------- */
loadPrefs();
applyName();
loadStore();
renderNotes();
if (prefs.save) {
  history = loadHistory();
}
if (history.length) {
  history.forEach(m => addMessage(m.text, m.role === "user" ? "user" : "ai"));
  addMessage("Pichhli baatein wapas aa gayi hain. Naya shuru karne ke liye \"clear\" likho.", "sys");
} else {
  addMessage("Namaste! Main " + prefs.name + " hoon. Type karo ya 🎤 dabakar bolo.", "ai");
}
