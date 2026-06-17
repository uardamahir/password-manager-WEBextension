# Aegis — Local Password Manager

**Local-only** password manager built as a browser extension on the **Web Crypto API**, with **zero third-party dependencies**.

> ⚠️ **This is a learning / demo project.** It has **not** undergone an independent security audit. **Do not store real-world passwords in it.** It is published openly to demonstrate the engineering and cryptography — not as a product to trust with real secrets.

# <img width="609" height="128" alt="ss1" src="https://github.com/user-attachments/assets/a51d26a8-c950-44da-8e47-e2df2e985331" />

# <img width="269" height="289" alt="ss2" src="https://github.com/user-attachments/assets/e384af74-1106-43a4-b70d-ac680086919a" />

# <img width="269" height="200" alt="ss3" src="https://github.com/user-attachments/assets/afcf4c60-210d-4718-a22f-ed0e152f0b41" />
 
## Features
- Encrypted vault protected by a single master password
- Store, edit, search and delete credentials
- Strong password generator (CSPRNG — never `Math.random`)
- **Domain-bound autofill** — fills login forms via on-demand injection; warns before filling on a site that doesn't match the saved entry (anti-phishing)
- **Breach check** against Have I Been Pwned using **k-anonymity** (only a 5-char hash prefix ever leaves the device)
- In-app security panel stating exactly what the tool protects against and what it does not
- Auto-locks after 5 minutes of inactivity; clipboard auto-clears after 15 seconds
- Encrypted export / import for backups
- Everything stays on your device — no servers, no telemetry, no accounts

## How the security works
- The vault is encrypted with **AES-256-GCM** (authenticated encryption).
- The key is **derived from your master password** with **PBKDF2-HMAC-SHA256**, **600,000 iterations**, and a random per-vault **salt**.
- The master password and the derived key are **never written to disk**. Only the ciphertext, the salt, and a per-encryption IV are stored (`chrome.storage.local`).
- The key lives **only in memory** (the background service worker) while unlocked, and is wiped on lock.
- A wrong master password is detected implicitly: a wrong key fails AES-GCM authentication, so decryption throws. No password or password-hash is ever stored.

## Threat model — honest about limits!

**Protects against**
- **Disk / file theft** — a stolen disk yields only ciphertext + salt + IV, useless without the master password.
- **Rainbow-table / precomputation** — the per-vault salt makes precomputed tables useless.
- **Tampering** — AES-GCM's authentication tag makes any change to the ciphertext fail decryption.
- **Malicious websites** — page scripts are sandboxed and cannot read the extension's storage or memory.
- **Accidental fill on a look-alike site** — autofill is domain-bound and requires explicit confirmation on a mismatch.

**Does NOT protect against**
- **A compromised device while unlocked** — OS-level malware, keyloggers, or memory-dumping tools can read the key and decrypted entries from RAM.
- **A weak master password** — all security rests on it; a guessable password defeats even a slow KDF.
- **Loss without a backup** — forget the master password or lose the device (with no export) and the vault is unrecoverable.
- **Unknown bugs** — this is unaudited, solo-built code.

## Install (developer mode) 
1. Download / clone this folder.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select the `password-manager` folder (the one containing `manifest.json`).
4. Click the shield icon, set a master password, and start.

## Design choices
- **Zero dependencies** — no npm packages, so no third-party code to trust and a minimal supply-chain surface. Built only on the browser's native Web Crypto API.
- **Manifest V3** with **least-privilege permissions** — no broad host access; autofill uses on-demand injection (`scripting` + `activeTab`) rather than a persistent content script.
- **Separation of concerns** — crypto, storage and generation are independent modules; the background worker orchestrates them; the popup only sends messages.
- **Local-only storage** — `chrome.storage.local`, never `sync`, so nothing leaves the device.
- **Knowing when to stop** — a deliberate, finished feature set over endless feature creep.

## License
MIT — see [LICENSE](LICENSE). Provided as-is for educational purposes, without warranty. Not security-audited; do not use for real secrets.
