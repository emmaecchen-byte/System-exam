export type QrCodeStatus = 'none' | 'active' | 'expired' | 'invalidated';

export function resolveQrCodeStatus(session: {
  qrTokenHash: string | null;
  qrIsValid: boolean;
  qrExpiresAt: Date | null;
  qrInvalidatedAt: Date | null;
  endTime: Date;
  status: string;
}): QrCodeStatus {
  if (!session.qrTokenHash) return 'none';

  const now = new Date();
  const timeExpired =
    (session.qrExpiresAt && session.qrExpiresAt < now) || session.endTime < now;

  if (session.qrInvalidatedAt) return 'invalidated';

  if (timeExpired || session.status === 'CLOSED' || session.status === 'ARCHIVED') {
    return 'expired';
  }

  if (!session.qrIsValid) return 'invalidated';

  return 'active';
}
