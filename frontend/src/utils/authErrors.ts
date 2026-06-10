import { AxiosError } from 'axios';
import type { ComposerTranslation } from 'vue-i18n';

export function getLoginErrorMessage(
  error: unknown,
  t: ComposerTranslation,
): string {
  const axiosErr = error as AxiosError<{ message?: string | string[] }>;

  if (!axiosErr.response) {
    return t('login.apiUnreachable');
  }

  const message = axiosErr.response.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  if (typeof message === 'string' && message.trim()) return message;

  if (axiosErr.response.status === 401) {
    return t('login.invalidCredentials');
  }

  return t('login.signInFailed');
}
