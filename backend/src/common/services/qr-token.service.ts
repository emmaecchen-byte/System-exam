import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/** @deprecated Legacy encrypted payload — only used when migrating old tokens */
export interface QrTokenPayload {
  sid: string;
  exp: number;
  jti: string;
  cid?: string;
}

@Injectable()
export class QrTokenService {
  private readonly key: Buffer;

  constructor(private config: ConfigService) {
    const secret = this.config.get<string>('QR_TOKEN_SECRET')
      ?? this.config.get<string>('JWT_SECRET')
      ?? 'dev-secret';
    this.key = createHash('sha256').update(secret).digest();
  }

  /** Cryptographically secure opaque token (32 random bytes, base64url). */
  generateOpaqueToken(): string {
    return randomBytes(32).toString('base64url');
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Encrypt token for server-side storage (admin QR image retrieval only). */
  encryptForStorage(token: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64url');
  }

  decryptFromStorage(payload: string): string {
    const data = Buffer.from(payload, 'base64url');
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const encrypted = data.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }

  /** @deprecated Legacy token format */
  createToken(payload: Omit<QrTokenPayload, 'jti'>): string {
    const full: QrTokenPayload = { ...payload, jti: randomBytes(16).toString('hex') };
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const plaintext = JSON.stringify(full);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64url');
  }

  /** @deprecated Legacy token format */
  decodeToken(token: string): QrTokenPayload {
    const data = Buffer.from(token, 'base64url');
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const encrypted = data.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    return JSON.parse(plaintext) as QrTokenPayload;
  }
}
