// popup.js — yüz. Hiç kripto bilmez; yalnızca background.js'e mesaj atar, cevabı gösterir.
import { generatePassword, estimateEntropyBits } from "./lib/generator.js";

function send(msg) { return chrome.runtime.sendMessage(msg); }

const $ = (id) => document.getElementById(id);
const show = (el) => el.removeAttribute("hidden");
const hide = (el) => el.setAttribute("hidden", "");
function showError(id, text) { const el = $(id); el.textContent = text; show(el); }

const screens = { setup: $("screen-setup"), unlock: $("screen-unlock"), vault: $("screen-vault") };
let aboutOpen = false;

function showScreen(name) {
  hide($("aboutPanel"));
  aboutOpen = false;
  $("infoBtn").classList.remove("active");
  for (const key in screens) (key === name ? show : hide)(screens[key]);
  const unlocked = name === "vault";
  $("lockBtn").toggleAttribute("hidden", !unlocked);
  $("lockDot").classList.toggle("unlocked", unlocked);
}

async function route() {
  const s = await send({ type: "status" });
  if (!s.hasVault) showScreen("setup");
  else if (!s.unlocked) showScreen("unlock");
  else { showScreen("vault"); await loadVault(); }
}

// ---- Güvenlik paneli: ⓘ aç/kapat toggle ----
$("infoBtn").addEventListener("click", () => {
  if (aboutOpen) { route(); return; }           // açıksa kapat (altaki doğru ekrana dön)
  for (const k in screens) hide(screens[k]);
  hide($("entryForm"));
  show($("aboutPanel"));
  aboutOpen = true;
  $("infoBtn").classList.add("active");
});

// ---- KURULUM ----
function updateStrength() {
  const v = $("setupPw").value;
  const wrap = $("strengthWrap");
  if (!v) { hide(wrap); return; }
  show(wrap);
  const bits = estimateEntropyBits(v);
  let label, color;
  if (bits < 40) { label = "Zayıf"; color = "var(--danger)"; }
  else if (bits < 60) { label = "Orta"; color = "var(--warn)"; }
  else if (bits < 80) { label = "İyi"; color = "var(--accent)"; }
  else { label = "Güçlü"; color = "var(--ok)"; }
  const bar = $("strengthBar");
  bar.style.width = Math.min(100, Math.round(bits)) + "%";
  bar.style.background = color;
  const lbl = $("strengthLabel");
  lbl.textContent = `${label} · ~${bits} bit`;
  lbl.style.color = color;
}
$("setupPw").addEventListener("input", updateStrength);

async function createVault() {
  const pw = $("setupPw").value, pw2 = $("setupPw2").value;
  hide($("setupError"));
  if (pw.length < 8) return showError("setupError", "Master parola en az 8 karakter olmalı.");
  if (pw !== pw2)    return showError("setupError", "Parolalar eşleşmiyor.");
  const r = await send({ type: "create", password: pw });
  if (!r.ok) return showError("setupError", "Oluşturulamadı: " + r.error);
  $("setupPw").value = $("setupPw2").value = "";
  hide($("strengthWrap"));
  showScreen("vault"); await loadVault();
}
$("createBtn").addEventListener("click", createVault);
$("setupPw").addEventListener("keydown", (e) => { if (e.key === "Enter") $("setupPw2").focus(); });
$("setupPw2").addEventListener("keydown", (e) => { if (e.key === "Enter") createVault(); });

// ---- KİLİT AÇ ----
async function doUnlock() {
  hide($("unlockError"));
  const r = await send({ type: "unlock", password: $("unlockPw").value });
  if (!r.ok) return showError("unlockError", "Yanlış parola.");
  $("unlockPw").value = "";
  showScreen("vault"); await loadVault();
}
$("unlockBtn").addEventListener("click", doUnlock);
$("unlockPw").addEventListener("keydown", (e) => { if (e.key === "Enter") doUnlock(); });

// ---- KİLİTLE ----
$("lockBtn").addEventListener("click", async () => {
  await send({ type: "lock" });
  showScreen("unlock");
});

// ============ KASA ============
let allEntries = [];
let editingId = null;
let currentHost = "";   // o anki sekmenin domain'i (autofill önerisi için)
let breachMap = {};     // id -> sızıntı sayısı (HIBP)

function hostOf(url) {
  if (!url) return "";
  try {
    const u = url.includes("://") ? url : "https://" + url;
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch { return url.toLowerCase(); }
}
function matchesCurrent(e) {
  if (!currentHost) return false;
  const h = hostOf(e.url);
  if (!h) return false;
  return currentHost === h || currentHost.endsWith("." + h) || h.endsWith("." + currentHost);
}
async function detectCurrentHost() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentHost = hostOf(tab?.url || "");
  } catch { currentHost = ""; }
}

// Kayıt için renkli avatar (başlığın baş harfi + başlıktan türetilen renk)
function avatarFor(title) {
  const t = (title || "").trim();
  const ch = (t[0] || "?").toUpperCase();
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 360;
  return { ch, hue: h };
}

async function loadVault() {
  await detectCurrentHost();
  const r = await send({ type: "list" });
  if (!r.ok) { showScreen("unlock"); return; }
  allEntries = r.entries;
  renderList();
}

function renderList() {
  const term = $("search").value.toLowerCase();
  const list = $("entryList");
  list.innerHTML = "";
  const filtered = allEntries
    .filter((e) => `${e.title} ${e.username} ${e.url}`.toLowerCase().includes(term))
    .sort((a, b) => matchesCurrent(b) - matchesCurrent(a)); // bu siteye uyanlar üstte
  $("emptyMsg").toggleAttribute("hidden", filtered.length > 0);
  for (const e of filtered) list.appendChild(renderEntry(e));
}

function makeBadge(text, cls) {
  const s = document.createElement("span");
  s.className = "badge " + cls;
  s.textContent = text;
  return s;
}

function renderEntry(e) {
  const li = document.createElement("li");
  li.className = "entry";
  li.innerHTML = `
    <div class="entry-main">
      <div class="avatar"></div>
      <div class="entry-text">
        <div class="title"></div>
        <div class="user"></div>
      </div>
    </div>
    <div class="actions">
      <button class="btn small" data-act="fill">Doldur</button>
      <button class="btn small ghost" data-act="copy">Kopyala</button>
      <button class="btn small ghost" data-act="edit">Düzenle</button>
      <button class="btn small ghost" data-act="del">Sil</button>
    </div>`;
  // Avatar
  const { ch, hue } = avatarFor(e.title);
  const av = li.querySelector(".avatar");
  av.textContent = ch;
  av.style.background = `hsl(${hue} 45% 20%)`;
  av.style.color = `hsl(${hue} 75% 74%)`;
  // Metin (textContent -> XSS yok) + rozetler
  const titleEl = li.querySelector(".title");
  titleEl.textContent = e.title || "(başlıksız)";
  if (matchesCurrent(e)) titleEl.appendChild(makeBadge("bu site", "site-badge"));
  const c = breachMap[e.id];
  if (c > 0) titleEl.appendChild(makeBadge(`sızmış (${c})`, "breach-badge"));
  li.querySelector(".user").textContent = e.username || "—";
  // Aksiyonlar
  const fillBtn = li.querySelector('[data-act="fill"]');
  fillBtn.onclick = () => fillActiveTab(e, fillBtn);
  const copyBtn = li.querySelector('[data-act="copy"]');
  copyBtn.onclick = () => copyPassword(e.password, copyBtn);
  li.querySelector('[data-act="edit"]').onclick = () => openForm(e);
  li.querySelector('[data-act="del"]').onclick = () => deleteEntry(e.id);
  return li;
}

// ---- Autofill: aktif sekmeye talep üzerine enjekte et ----
async function fillActiveTab(entry, btn) {
  // Anti-phishing: kaydın domain'i o anki siteyle uyuşmuyorsa iki adımlı onay iste.
  const entryHost = hostOf(entry.url);
  if (currentHost && entryHost && !matchesCurrent(entry)) {
    if (btn && btn.dataset.confirm !== "1") {
      btn.dataset.confirm = "1";
      btn.textContent = "Yine de?";
      btn.title = `Bu kayıt "${entryHost}" için; şu an "${currentHost}" sitesindesin.`;
      btn.classList.add("warn");
      setTimeout(() => {
        if (btn.isConnected) {
          btn.dataset.confirm = "0";
          btn.textContent = "Doldur";
          btn.classList.remove("warn");
          btn.removeAttribute("title");
        }
      }, 3500);
      return; // ilk tık uyarır; doldurmak için ikinci tık gerekir
    }
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (u, p) => {
        const setVal = (el, val) => {
          const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value");
          desc.set.call(el, val); // native setter -> React vb. fark eder
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        };
        const pwd = document.querySelector('input[type="password"]');
        if (pwd) setVal(pwd, p);
        const user = document.querySelector(
          'input[type="email"], input[autocomplete="username"], input[name*="user" i], input[id*="user" i], input[name*="email" i], input[type="text"]'
        );
        if (user) setVal(user, u);
      },
      args: [entry.username, entry.password],
    });
    window.close();
  } catch {
    // chrome:// gibi kısıtlı sayfalarda enjeksiyon başarısız olur — sessizce geç
  }
}

// ---- HIBP: k-anonimlik ile sızıntı kontrolü ----
async function hibpCount(password) {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-1", data);
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  const prefix = hex.slice(0, 5), suffix = hex.slice(5); // SADECE ilk 5 karakter yollanır
  const res = await fetch("https://api.pwnedpasswords.com/range/" + prefix);
  const text = await res.text();
  for (const line of text.split("\n")) {
    const [suf, count] = line.trim().split(":");
    if (suf === suffix) return parseInt(count, 10) || 1;
  }
  return 0;
}

$("scanBtn").addEventListener("click", async () => {
  const status = $("scanStatus");
  status.textContent = "Taranıyor…";
  $("scanBtn").disabled = true;
  try {
    let breached = 0;
    for (const e of allEntries) {
      const c = await hibpCount(e.password);
      breachMap[e.id] = c;
      if (c > 0) breached++;
    }
    status.textContent = breached
      ? `${breached} parola sızıntılarda görünüyor — değiştir.`
      : "Tüm parolalar temiz görünüyor.";
    renderList();
  } catch {
    status.textContent = "Kontrol başarısız (ağ / izin).";
  } finally {
    $("scanBtn").disabled = false;
  }
});

// ---- Kopyala (geri bildirimli) ----
async function copyPassword(pw, btn) {
  try {
    await navigator.clipboard.writeText(pw);
    if (btn) {
      const old = btn.textContent;
      btn.textContent = "Kopyalandı";
      btn.classList.add("ok");
      setTimeout(() => {
        if (btn.isConnected) { btn.textContent = old; btn.classList.remove("ok"); }
      }, 1400);
    }
    setTimeout(() => navigator.clipboard.writeText("").catch(() => {}), 15000); // 15 sn sonra temizle
  } catch {}
}

// ---- Form ----
function openForm(entry = null) {
  editingId = entry ? entry.id : null;
  $("fTitle").value = entry?.title || "";
  $("fUrl").value   = entry?.url || "";
  $("fUser").value  = entry?.username || "";
  $("fPass").value  = entry?.password || "";
  $("fNotes").value = entry?.notes || "";
  $("fPass").type = "password";
  $("togglePass").textContent = "Göster";
  show($("entryForm"));
  $("fTitle").focus();
}
$("addBtn").addEventListener("click", () => openForm());
$("cancelBtn").addEventListener("click", () => hide($("entryForm")));
$("genBtn").addEventListener("click", () => {
  $("fPass").value = generatePassword({ length: 20 });
  $("fPass").type = "text";              // üretileni görebilesin
  $("togglePass").textContent = "Gizle";
});
$("togglePass").addEventListener("click", () => {
  const f = $("fPass");
  const reveal = f.type === "password";
  f.type = reveal ? "text" : "password";
  $("togglePass").textContent = reveal ? "Gizle" : "Göster";
});

async function saveEntry() {
  const data = {
    title: $("fTitle").value, url: $("fUrl").value,
    username: $("fUser").value, password: $("fPass").value, notes: $("fNotes").value,
  };
  const r = editingId
    ? await send({ type: "update", entry: { id: editingId, ...data } })
    : await send({ type: "add", entry: data });
  if (!r.ok) return;
  hide($("entryForm"));
  await loadVault();
}
$("saveBtn").addEventListener("click", saveEntry);
for (const id of ["fTitle", "fUrl", "fUser", "fPass"]) {
  $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") saveEntry(); });
}

async function deleteEntry(id) {
  await send({ type: "delete", id });
  delete breachMap[id];
  await loadVault();
}

$("search").addEventListener("input", renderList);

route(); // başlat
