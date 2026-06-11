import { JwtSignOptions } from '@nestjs/jwt';

/** Cast env duration strings (e.g. "8h", "7d") for @nestjs/jwt v11 sign options. */
export function asJwtExpiresIn(value: string): JwtSignOptions['expiresIn'] {
  return value as JwtSignOptions['expiresIn'];
}
