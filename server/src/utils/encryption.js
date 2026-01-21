const crypto = require('crypto');
const config = require('../config');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Get encryption key from config (must be 32 bytes for AES-256)
 */
const getKey = () => {
  const key = config.encryptionKey;
  if (!key || key.length < 32) {
    throw new Error('ENCRYPTION_KEY must be at least 32 characters');
  }
  return Buffer.from(key.slice(0, 32), 'utf8');
};

/**
 * Encrypt a string value
 * @param {string} text - Plain text to encrypt
 * @returns {string} - Encrypted string (iv:authTag:ciphertext in hex)
 */
const encrypt = (text) => {
  if (!text) return text;

  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Return iv:authTag:ciphertext
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
};

/**
 * Decrypt a string value
 * @param {string} encryptedText - Encrypted string (iv:authTag:ciphertext)
 * @returns {string} - Decrypted plain text
 */
const decrypt = (encryptedText) => {
  if (!encryptedText) return encryptedText;

  const key = getKey();
  const parts = encryptedText.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted text format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const ciphertext = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

/**
 * Encrypt an object (JSON)
 * @param {Object} obj - Object to encrypt
 * @returns {string} - Encrypted JSON string
 */
const encryptObject = (obj) => {
  if (!obj) return obj;
  return encrypt(JSON.stringify(obj));
};

/**
 * Decrypt to an object (JSON)
 * @param {string} encryptedText - Encrypted JSON string
 * @returns {Object} - Decrypted object
 */
const decryptObject = (encryptedText) => {
  if (!encryptedText) return encryptedText;
  return JSON.parse(decrypt(encryptedText));
};

/**
 * Hash a value (one-way, for comparison)
 * @param {string} value - Value to hash
 * @returns {string} - Hashed value
 */
const hash = (value) => {
  return crypto.createHash('sha256').update(value).digest('hex');
};

module.exports = {
  encrypt,
  decrypt,
  encryptObject,
  decryptObject,
  hash,
};
