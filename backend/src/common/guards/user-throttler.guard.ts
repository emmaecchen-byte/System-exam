import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { RequestUser } from '../decorators/auth.decorator';

@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as RequestUser | undefined;
    if (user?.userId) {
      return `user:${user.userId}`;
    }
    return (req.ip as string) ?? 'anonymous';
  }
}
