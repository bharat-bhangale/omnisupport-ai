import crypto from 'crypto';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const childLogger = logger.child({ service: 'credentialCrypto' });

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Derive a 32-byte key from the environment encryption key
 */
function deriveKey(): Buffer {
  const key = env.INTEGRATION_ENCRYPTION_KEY;
  if (key.length >= KEY_LENGTH) {
    return Buffer.from(key.slice(0, KEY_LENGTH), 'utf8');
  }
  // Pad key if too short (should not happen with proper config)
  return Buffer.from(key.padEnd(KEY_LENGTH, '0'), 'utf8');
}

/**
 * Encrypt a credential value using AES-256-GCM
 * Returns base64-encoded string containing IV + authTag + ciphertext
 */
export function encryptCredential(plaintext: string): string {
  try {
    const key = deriveKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    const authTag = cipher.getAuthTag();
    
    // Combine IV + authTag + ciphertext
    const combined = Buffer.concat([iv, authTag, encrypted]);
    
    return combined.toString('base64');
  } catch (error) {
    childLogger.error({ error }, 'Failed to encrypt credential');
    throw new Error('Credential encryption failed');
  }
}

/**
 * Decrypt a credential value
 * Expects base64-encoded string containing IV + authTag + ciphertext
 */
export function decryptCredential(encryptedBase64: string): string {
  try {
    const key = deriveKey();
    const combined = Buffer.from(encryptedBase64, 'base64');
    
    // Extract IV, authTag, and ciphertext
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    childLogger.error({ error }, 'Failed to decrypt credential');
    throw new Error('Credential decryption failed');
  }
}

/**
 * Check if a string is encrypted (base64 with correct length structure)
 */
export function isEncrypted(value: string): boolean {
  try {
    const decoded = Buffer.from(value, 'base64');
    // Minimum length: IV (16) + authTag (16) + at least 1 byte ciphertext
    return decoded.length >= IV_LENGTH + AUTH_TAG_LENGTH + 1;
  } catch {
    return false;
  }
}

/**
 * Mask a credential for display (show first 4 and last 4 chars)
 */
export function maskCredential(value: string): string {
  if (!value || value.length <= 8) {
    return '********';
  }
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}
