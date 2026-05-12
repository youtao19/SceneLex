/**
 * Decode a base64url string into a Uint8Array.
 * base64url uses - instead of +, _ instead of /, and no = padding.
 */
function base64urlToBytes(input) {
  // Convert base64url to standard base64
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');

  // Add padding
  const remainder = base64.length % 4;
  if (remainder) {
    base64 += '='.repeat(4 - remainder);
  }

  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);

  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }

  return bytes;
}

/**
 * Derive a 32-byte AES-256 key from a secret string via SHA-256.
 * Matches Node.js: createHash('sha256').update(secret).digest()
 */
async function deriveKey(secret) {
  const data = new TextEncoder().encode(secret);
  return crypto.subtle.digest('SHA-256', data);
}

/**
 * Decrypt an AES-256-GCM encrypted value produced by Express
 * (settings.repository.ts encryptApiKey).
 *
 * Express storage format: base64url(iv) + "." + base64url(tag) + "." + base64url(ciphertext)
 *
 * Web Crypto expects the GCM authentication tag appended to the
 * ciphertext, unlike Node.js which keeps them separate.
 *
 * Returns empty string for malformed input (matching Node.js behavior).
 */
export async function decryptApiKey(encryptedValue, secret) {
  const parts = encryptedValue.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    return '';
  }

  const ivText = parts[0];
  const tagText = parts[1];
  const ciphertextText = parts[2];

  let iv;
  let tag;
  let ciphertext;

  try {
    iv = base64urlToBytes(ivText);
    tag = base64urlToBytes(tagText);
    ciphertext = base64urlToBytes(ciphertextText);
  } catch {
    return '';
  }

  // Web Crypto expects ciphertext + tag concatenated
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext, 0);
  combined.set(tag, ciphertext.length);

  const keyData = await deriveKey(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    combined,
  );

  return new TextDecoder().decode(plaintext);
}

/**
 * Encode a Uint8Array to base64url.
 */
function bytesToBase64url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Encrypt a plaintext string with AES-256-GCM, producing output
 * compatible with Express (settings.repository.ts encryptApiKey).
 *
 * Express storage format: base64url(iv) + "." + base64url(tag) + "." + base64url(ciphertext)
 */
export async function encryptApiKey(plaintext, secret) {
  const keyData = await deriveKey(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    encoded,
  );

  // Web Crypto returns ciphertext + tag concatenated
  const combined = new Uint8Array(encrypted);
  const ciphertext = combined.slice(0, combined.length - 16);
  const tag = combined.slice(combined.length - 16);

  return [
    bytesToBase64url(iv),
    bytesToBase64url(tag),
    bytesToBase64url(ciphertext),
  ].join('.');
}
