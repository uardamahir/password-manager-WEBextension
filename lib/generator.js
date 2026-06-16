// generator.js — kasaya kaydedeceğin HESAP parolalarını üretir.
// (Master parola DEĞİL — onu kullanıcı seçer. Bu, vault içindeki kayıtlar için.)
// Saf bir yardımcı: ne anahtara ne depoya ihtiyacı var. ASLA Math.random kullanmaz.

const SETS = {
  lower: "abcdefghijkmnopqrstuvwxyz", // 'l' yok (1/l karışmasın)
  upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",  // 'I' ve 'O' yok
  digits: "23456789",                  // '0' ve '1' yok
  symbols: "!@#$%^&*()-_=+[]{};:,.?",
};

// [0, n) aralığında TARAFSIZ (unbiased) indeks — rejection sampling ile modulo bias'ı önler
function randomIndex(n) {
  const limit = Math.floor(0xffffffff / n) * n; // tam bölünmeyen taşan kuyruğu hesapla
  let x;
  do {
    x = crypto.getRandomValues(new Uint32Array(1))[0]; // CSPRNG — güvenli rastgelelik
  } while (x >= limit);                                  // kuyruğa düşeni reddet
  return x % n;
}

export function generatePassword(options = {}) {
  const {
    length = 20,
    lower = true,
    upper = true,
    digits = true,
    symbols = true,
  } = options;

  const chosen = [];
  if (lower) chosen.push(SETS.lower);
  if (upper) chosen.push(SETS.upper);
  if (digits) chosen.push(SETS.digits);
  if (symbols) chosen.push(SETS.symbols);
  if (chosen.length === 0) chosen.push(SETS.lower); // hiçbir küme seçilmezse en azından biri

  const pool = chosen.join("");
  const out = [];

  // Seçilen her kümeden en az bir karakter garantile
  for (const set of chosen) out.push(set[randomIndex(set.length)]);
  // Kalanını tüm havuzdan rastgele doldur
  while (out.length < length) out.push(pool[randomIndex(pool.length)]);

  // Fisher–Yates karıştır (CSPRNG ile) — garantili karakterler hep başta kalmasın
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }

  return out.slice(0, length).join("");
}

// UI'da güç göstergesi için kaba entropi tahmini (bit) = uzunluk × log2(havuz)
export function estimateEntropyBits(password) {
  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/[0-9]/.test(password)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(password)) pool += 30;
  return pool === 0 ? 0 : Math.round(password.length * Math.log2(pool));
}
