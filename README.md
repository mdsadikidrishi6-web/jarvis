# JARVIS Personal Assistant

Ek personal AI assistant jo Android Chrome par PWA ki tarah chalta hai.
Frontend GitHub Pages par hai, aur AI ka kaam ek Cloudflare Worker (Gemini) karta hai.

> Is README mein koi API key ya secret **nahi** likhna. Key sirf Cloudflare mein rehti hai.

## 1. Kaise chalta hai

```
Phone (Chrome / PWA)  ->  Cloudflare Worker "jarvis-api"  ->  Gemini API
   GitHub Pages            (API key yahan safe hai)
```

- Phone ka code kabhi API key nahi dekhta.
- Worker sirf tumhari GitHub Pages site (`ALLOWED_ORIGIN`) se aane wali requests leta hai.
- Chat history, notes, to-do aur settings **sirf is phone ke browser mein** save hote hain (server par nahi).

## 2. Files (GitHub repo `jarvis`)

| File | Kaam |
|---|---|
| `index.html` | Screen ka structure, panels (Settings, Notes, NEET Study) |
| `style.css`, `notes.css` | Design |
| `app.js` | Mic, awaaz, commands, AI calls, notes, settings, study panel |
| `manifest.json` | PWA ka naam aur icon |
| `service-worker.js` | Offline mein screen kholne ke liye cache |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | App icons |
| `README.md` | Ye guide |

## 3. Cloudflare Worker settings

Worker: `jarvis-api` > Settings > Variables and Secrets. Teeno naam **chhote letters** mein.

| Type | Name | Value |
|---|---|---|
| Secret | `gemini_api_key` | Google AI Studio wali key (kisi ko mat dikhao) |
| Text | `allowed_origin` | `https://USERNAME.github.io` (bina `/jarvis`, bina aakhri `/`) |
| Text | `gemini_model` | Abhi chalne wala Gemini model ka naam |

## 4. Final test checklist

Har item phone par (Chrome ya installed app) khud check karo.

**App aur layout**
- [ ] App khulta hai aur chat mein "Namaste!" message dikhta hai
- [ ] Horizontal scroll nahi hota
- [ ] Header mein status, 🎓, 📝, ⚙️ dikhte hain aur teeno panel khulte aur band hote hain

**Text aur AI**
- [ ] Typed message par AI ka asli jawab aata hai
- [ ] Follow-up sawal mein AI pichhli baat yaad rakhta hai
- [ ] `clear` likhne par chat saaf hoti hai aur AI context bhool jata hai
- [ ] Airplane mode mein bhejne par saaf error dikhta hai

**Mic aur awaaz**
- [ ] 🎤 par Chrome permission poochta hai, Allow karne par bolna chalta hai
- [ ] Hindi aur English dono try kiye
- [ ] Permission Block karke dekha: saaf message aata hai aur typed chat chalti hai
- [ ] AI ka jawab awaaz mein bolta hai; Stop button ruk jata hai
- [ ] Awaaz ki speed slider kaam karta hai

**Commands**
- [ ] "Hello JARVIS", "What time is it?", "Tell me a joke"
- [ ] "Open YouTube" / "Open Google": confirmation card aata hai, Haan dabane par naya tab khulta hai
- [ ] "Search for NEET 2027 syllabus": Google search ka card aata hai
- [ ] "Stop speaking" aur "Clear conversation"

**Memory aur privacy**
- [ ] History OFF ho to refresh par chat saaf rehti hai
- [ ] History ON karne par refresh ke baad baatein wapas aati hain
- [ ] "Saara saved data delete karo" chat, settings, notes aur to-do sab hata deta hai

**Weather**
- [ ] "weather Delhi" ya "mausam Delhi" likho: shehar ka mausam aata hai aur bolta bhi hai
- [ ] "weather" akela likho: pehle Haan/Nahi card aata hai, Haan par Chrome location permission poochta hai
- [ ] Location Block karne par saaf message aata hai aur shehar ka naam likhne ko kehta hai
- [ ] Mausam ke baad follow-up sawal ("umbrella lun?") AI ko pata hota hai

**Notes, to-do, NEET**
- [ ] "note karo: ..." aur "add todo ..." save hote hain, 📝 mein dikhte hain, refresh ke baad bhi
- [ ] NEET panel se quiz aata hai, A/B/C/D ka jawab dene par AI sahi/galat batata hai

**PWA**
- [ ] Home screen se icon dabane par app bina address bar ke khulta hai
- [ ] Airplane mode mein app ka screen khulta hai (AI aur mic nahi chalenge)

**Security**
- [ ] GitHub repo mein kisi file mein API key nahi hai (`app.js` mein sirf Worker ka link hai)
- [ ] Worker ka link kisi ko share nahi kiya

## 5. Free limits (badal sakti hain, dashboard mein dekhte raho)

- **Cloudflare Workers Free:** 100,000 requests/din, aur har request par 10 ms CPU time. Ek personal app ke liye kaafi hai.
- **GitHub Pages:** sirf static files, aur bandwidth par soft limit hoti hai. Personal use mein koi dikkat nahi.
- **Weather (Open-Meteo):** free aur bina API key ke chalta hai, lekin sirf non-commercial use ke liye. Ek personal app ke liye theek hai. App Open-Meteo ko seedha browser se call karta hai (Worker se nahi). Shehar ka naam ya (location use karne par) lagbhag 1 km tak ki location Open-Meteo ko jaati hai. Location app mein kahin save nahi hoti.
- **Gemini free tier:** requests par per-minute aur per-day limit hoti hai, aur limits Google badalta rehta hai. Exact numbers Google AI Studio mein dekho. Free tier mein bheja gaya content Google ke products improve karne mein use ho sakta hai, isliye private cheezein (password, ID, bank details) kabhi mat poochho.

## 6. Kuch kharab ho to (Troubleshooting)

| Kya dikha | Wajah | Fix |
|---|---|---|
| "Server tak pahunch nahi paye" | Internet band, ya app galat link se khola | Internet check karo, GitHub Pages ya installed app se kholo |
| Console mein "CORS" error | Worker ne origin mana kiya | `allowed_origin` bilkul `https://USERNAME.github.io` ho, Worker Deploy karo |
| "Origin allowed nahi hai" | Wahi | Wahi |
| "Server mein API key set nahi hai" | Secret ka naam galat ya Deploy nahi hua | Naam `gemini_api_key` (chhote letters), Deploy dabao |
| "AI service error (404)" | Gemini model ka naam ab band ho gaya | `gemini_model` mein Google ka abhi ka chalne wala model likho, Deploy karo |
| "API key ya model ka issue hai" | Key galat copy hui ya expire | AI Studio mein nayi key banao, secret mein badlo |
| "Free limit poori ho gayi" (429) | Gemini ki free limit | Kuch der ruko, ya doosra model try karo |
| Naya feature nahi dikha / purana chal raha hai | GitHub par file update nahi hui, ya cache | Same naam se upload karo, 2 minute ruko, `Ctrl + Shift + R` ya app band karke kholo |
| Page par kuch bhi kaam nahi karta, chat khali | `app.js` adhuri upload hui | `/app.js` link naye tab mein kholke `Ctrl + F` se naya shabd dhundho; na mile to dobara upload karo |
| Console mein "Unexpected end of input" | File beech mein kat gayi | Poori file dobara upload karo (copy-paste se bacho) |
| Mic kaam nahi karta | Permission block, ya HTTP page | Lock icon > Permissions > Microphone > Allow. Sirf HTTPS link par kholo |
| "Mausam ki service tak pahunch nahi paye" | Internet band ya Open-Meteo abhi down | Internet check karo, thodi der baad try karo |
| "Is naam ka shehar nahi mila" | Shehar ka spelling | English mein likho, jaise "weather Kolkata" |
| Location permission deny | Chrome mein block ho gayi | Lock icon > Permissions > Location > Allow, ya shehar ka naam likho |
| Hindi bolne par command nahi pakda | Mic ne alag spelling likhi | English select karke bolo ya type karo |
| AI bole "note save kar liya" par panel khali | AI note save nahi kar sakta | Chhota "Note save ho gaya" confirmation aur 📝 mein entry hi bharosemand hai |
| Install app option nahi dikhta | Page abhi poora load nahi hua | 30 second ruko, menu mein "Add to Home screen" bhi try karo, Chrome use karo |

**Console kholna (laptop):** `Ctrl + Shift + J`. Lal error ki pehli line sabse zaroori hoti hai.

## 7. File update kaise karein

1. Nayi file ko bilkul purane naam se rakho (`app.js`, `index.html`, ...).
2. GitHub > repo `jarvis` > Add file > Upload files > Commit changes.
3. 1 se 2 minute ruko, phir page refresh karo.
4. Worker ke code mein badlav ho to Cloudflare mein Deploy dabana mat bhoolo.

## 8. Kya ye app NAHI kar sakta

- Dusre apps (WhatsApp, Camera, Settings) control karna, messages ya files padhna
- Background mein "Hey JARVIS" suna (wake-word)
- Reminders jo app band hone par bhi notification dein
- Internet ke bina AI jawab ya mic

Ye sab ke liye native Android app chahiye hoti, jo is project ka hissa nahi hai.

## 9. Safety yaad rakho

- API key kisi chat, screenshot, GitHub file ya message mein mat daalo. Galti se dikh jaye to AI Studio mein turant nayi key banao aur purani delete karo.
- Worker ka link share mat karo (tumhari free limit koi aur use kar sakta hai).
- Notes mein password ya ID numbers mat likho. Phone kisi ke haath lage to dikh sakte hain.
- AI numericals aur facts mein galti kar sakta hai. NEET ke liye NCERT se verify karo.
