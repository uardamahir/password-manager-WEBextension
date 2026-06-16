// background.js — service worker (beyin). crypto.js + storage.js'i burada birleştiriyoruz.
// Çözülmüş kasa ve anahtar YALNIZCA burada, YALNIZCA kasa açıkken, RAM'de yaşar.
//
// MV3 notu: tarayıcı boştaki service worker'ı kapatabilir; bu RAM'deki durumu siler,
// yani kasa fiilen kilitlenir. Bu bir kusur değil — daha güvenli; kullanıcı tekrar açar.

import {
  deriveKey, encryptJSON, decryptJSON,
  fromBase64, toBase64, randomBytes,
  PBKDF2_ITERATIONS, SALT_BYTES,
} from "./lib/crypto.js";
import {
  loadRecord, saveRecord, clearRecord, recordExists,
} from "./lib/storage.js";

const AUTO_LOCK_MINUTES = 5;

// ---- Bellekteki durum (asla diske yazılmaz) ----
let cryptoKey = null;   // CryptoKey "kulpu" (ham baytları JS göremez)
let entries = null;     // çözülmüş kayıt dizisi
let kdfSalt = null;     // Uint8Array
let kdfIterations = PBKDF2_ITERATIONS;

// ---- Kilit ----
function lock() {
  cryptoKey = null;
  entries = null;
  kdfSalt = null;
  chrome.alarms.clear("autolock");
}
function armAutoLock() {
  if (!cryptoKey) return;
  chrome.alarms.create("autolock", { delayInMinutes: AUTO_LOCK_MINUTES });
}
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "autolock") lock();
});
function requireUnlocked() {
  if (!cryptoKey || !entries) throw new Error("LOCKED");
}

// ---- Diske yazma: tüm kasayı yeniden şifrele + kaydet ----
async function persist() {
  const blob = await encryptJSON(entries, cryptoKey); // YENİ iv ile şifrele
  await saveRecord({
    version: 1,
    kdf: {
      name: "PBKDF2", hash: "SHA-256",
      iterations: kdfIterations, salt: toBase64(kdfSalt),
    },
    vault: blob,
  });
}

// ---- Kasa kur / aç ----
async function createVault(masterPassword) {
  if (await recordExists()) throw new Error("EXISTS");
  kdfSalt = randomBytes(SALT_BYTES);   // salt: bir kez üretilir
  kdfIterations = PBKDF2_ITERATIONS;
  cryptoKey = await deriveKey(masterPassword, kdfSalt, kdfIterations);
  entries = [];
  await persist();
  armAutoLock();
}

async function unlock(masterPassword) {
  const record = await loadRecord();
  if (!record) throw new Error("NO_VAULT");
  const salt = fromBase64(record.kdf.salt);
  const iterations = record.kdf.iterations;
  const candidateKey = await deriveKey(masterPassword, salt, iterations);
  // Yanlış parola -> AES-GCM doğrulaması patlar -> decryptJSON hata fırlatır
  const data = await decryptJSON(record.vault, candidateKey);
  cryptoKey = candidateKey;
  kdfSalt = salt;
  kdfIterations = iterations;
  entries = data;
  armAutoLock();
}

// ---- Kayıt yardımcıları ----
function newEntry(input) {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: input.title || "",
    url: input.url || "",
    username: input.username || "",
    password: input.password || "",
    notes: input.notes || "",
    createdAt: now,
    updatedAt: now,
  };
}

// ---- Mesaj API'si (popup buradan konuşur) ----
async function handle(msg) {
  switch (msg.type) {
    case "status":
      return { ok: true, hasVault: await recordExists(), unlocked: !!cryptoKey, autoLockMinutes: AUTO_LOCK_MINUTES };

    case "create":
      await createVault(msg.password);
      return { ok: true };

    case "unlock":
      await unlock(msg.password);
      return { ok: true };

    case "lock":
      lock();
      return { ok: true };

    case "list":
      requireUnlocked(); armAutoLock();
      return { ok: true, entries };

    case "add": {
      requireUnlocked();
      const entry = newEntry(msg.entry);
      entries.push(entry);
      await persist(); armAutoLock();
      return { ok: true, entry };
    }

    case "update": {
      requireUnlocked();
      const i = entries.findIndex((e) => e.id === msg.entry.id);
      if (i === -1) throw new Error("NOT_FOUND");
      entries[i] = { ...entries[i], ...msg.entry, updatedAt: Date.now() };
      await persist(); armAutoLock();
      return { ok: true };
    }

    case "delete":
      requireUnlocked();
      entries = entries.filter((e) => e.id !== msg.id);
      await persist(); armAutoLock();
      return { ok: true };

    case "changeMaster": {
      requireUnlocked();
      kdfSalt = randomBytes(SALT_BYTES);          // yeni salt
      kdfIterations = PBKDF2_ITERATIONS;
      cryptoKey = await deriveKey(msg.newPassword, kdfSalt, kdfIterations);
      await persist();                             // mevcut kayıtları yeni anahtarla yeniden şifrele
      armAutoLock();
      return { ok: true };
    }

    case "export": {                               // yalnızca ciphertext dışarı çıkar — güvenli yedek
      const record = await loadRecord();
      if (!record) throw new Error("NO_VAULT");
      return { ok: true, record };
    }

    case "import": {
      if (!msg.record || !msg.record.kdf || !msg.record.vault) throw new Error("BAD_FILE");
      await saveRecord(msg.record);
      lock();                                       // yedeğin kendi master parolasıyla açılsın
      return { ok: true };
    }

    case "wipe":
      lock();
      await clearRecord();
      return { ok: true };

    default:
      throw new Error("UNKNOWN_COMMAND");
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handle(msg)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
  return true; // async cevap için kanalı açık tut
});
