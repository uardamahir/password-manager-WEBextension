// crypto.js — tüm kriptografi burada, YALNIZCA Web Crypto API üzerine, sıfır bağımlılık.
//
// İki primitif:
//   PBKDF2  -> master parola + salt'tan anahtar TÜRETİR (kasıtlı yavaş)
//   AES-GCM -> o anahtarla kasayı şifreler/çözer (authenticated: yanlış anahtarda hata fırlatır)

const PBKDF2_ITERATIONS = 600_000; // türetmeyi bilinçli olarak yavaşlatır (kaba kuvvete karşı)
const SALT_BYTES = 16;             // kasa başına bir kez üretilir
const IV_BYTES = 12;               // AES-GCM için önerilen nonce; HER şifrelemede yenisi

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Kriptografik güvenli rastgele baytlar (salt ve IV için)
export function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

// Baytları chrome.storage'a yazılabilir metne çevir / geri al
export function toBase64(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
}
export function fromBase64(b64) {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

// Master parola + salt -> dışa aktarılamaz AES-256-GCM anahtarı (yalnızca bellekte yaşar)
export async function deriveKey(masterPassword, salt, iterations = PBKDF2_ITERATIONS) {
  // 1) Parolayı PBKDF2'ye sokulabilir "ham malzeme" anahtarına çevir
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(masterPassword),
    "PBKDF2",
    false,          // dışa aktarılamaz
    ["deriveKey"]   // tek izni: anahtar türetmek
  );
  // 2) Yavaş + tuzlu türetmeyle gerçek AES anahtarını üret
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,                  // anahtarın ham baytlarını JS asla göremez
    ["encrypt", "decrypt"]
  );
}

// Kasayı şifrele — her çağrıda YENİ iv (asla tekrar kullanılmaz)
export async function encryptJSON(obj, key) {
  const iv = randomBytes(IV_BYTES);
  const plaintext = encoder.encode(JSON.stringify(obj));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { iv: toBase64(iv), ciphertext: toBase64(ciphertext) };
}

// Şifreli kasayı çöz — yanlış anahtar (yanlış parola) ya da kurcalama -> HATA fırlatır
export async function decryptJSON(blob, key) {
  const iv = fromBase64(blob.iv);
  const ciphertext = fromBase64(blob.ciphertext);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(decoder.decode(plaintext));
}

export { PBKDF2_ITERATIONS, SALT_BYTES, IV_BYTES };
