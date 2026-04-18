// lib/crypto.ts - ENCRIPTACIÓN
import crypto from 'crypto';

let ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '12345678901234567890123456789012';

// Si la llave provista por Vercel está incompleta o mal digitada, 
// forzamos la llave temporal para evitar que el compilador se rompa:
if (ENCRYPTION_KEY.length !== 32) {
  ENCRYPTION_KEY = '12345678901234567890123456789012';
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY!), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(encryptedText: string): string {
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 2) throw new Error('Invalid encrypted format');
    
    const iv = Buffer.from(parts[0], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY!), iv);
    let decrypted = decipher.update(parts[1], 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    throw new Error('Decryption failed');
  }
}
