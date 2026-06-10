import { Request } from 'express';

export interface RequestAuditContext {
  ip?: string;
  userAgent?: string;
  deviceInfo?: string;
}

export function parseUserAgent(userAgent?: string): { browser: string; os: string } {
  if (!userAgent) return { browser: 'Unknown', os: 'Unknown' };
  let browser = 'Unknown';
  if (userAgent.includes('Edg/')) browser = 'Edge';
  else if (userAgent.includes('Chrome/')) browser = 'Chrome';
  else if (userAgent.includes('Firefox/')) browser = 'Firefox';
  else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome')) browser = 'Safari';

  let os = 'Unknown';
  if (userAgent.includes('Windows')) os = 'Windows';
  else if (userAgent.includes('Mac OS')) os = 'macOS';
  else if (userAgent.includes('Android')) os = 'Android';
  else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) os = 'iOS';
  else if (userAgent.includes('Linux')) os = 'Linux';

  return { browser, os };
}

export function extractRequestAudit(req: Request): RequestAuditContext {
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    req.ip ||
    (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined) ||
    req.socket.remoteAddress ||
    undefined;
  const userAgent = req.headers['user-agent'];
  const parsed = parseUserAgent(userAgent);
  return {
    ip,
    userAgent,
    deviceInfo: JSON.stringify(parsed),
  };
}
