// storage.js — diske erişimin tek kapısı. Yalnızca ŞİFRELİ kaydı okur/yazar.
// Kriptodan haberi yok; sadece verilen paketi saklar. chrome.storage.local kullanır
// (cihaz-yerel, web sayfaları erişemez, sync'e göre çok daha geniş kotalı).

const RECORD_KEY = "aegis_vault_v1";

// Diske yazılan kaydın şekli (hepsi AÇIK veri; kasa zaten şifreli):
// {
//   version: 1,
//   kdf:   { name, hash, iterations, salt(base64) },  // anahtarı yeniden türetmek için
//   vault: { iv(base64), ciphertext(base64) }          // AES-GCM ile şifreli kayıtlar
// }

// Kaydı oku (yoksa null döner)
export async function loadRecord() {
  const res = await chrome.storage.local.get(RECORD_KEY);
  return res[RECORD_KEY] || null; // get -> {KEY: değer}, içinden çekiyoruz
}

// Kaydı yaz (varsa üzerine yazar)
export async function saveRecord(record) {
  await chrome.storage.local.set({ [RECORD_KEY]: record });
}

// Kasayı diskten tamamen kaldır
export async function clearRecord() {
  await chrome.storage.local.remove(RECORD_KEY);
}

// Daha önce kurulmuş bir kasa var mı?
export async function recordExists() {
  return (await loadRecord()) !== null;
}
