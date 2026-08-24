import { formatLocation } from './location';
import { DEFAULT_TIMEZONE, formatOwnerTimestamp } from './time';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export const COMMENT_NOTIFICATION_FROM = 'TurkCyber <notifications@notify.turkcyber.com>';
export const COMMENT_NOTIFICATION_TO = 'admin@turkcyber.com';
export const COMMENT_NOTIFICATION_SUBJECT = 'TurkCyber — Yeni yorum bekliyor';
export const COMMENT_MODERATION_URL = 'https://turkcyber.com/boss/comments/';

export interface PendingCommentNotification {
  id: number;
  environment: string;
  author: string;
  email: string | null;
  ip: string | null;
  country: string | null;
  city: string | null;
  regionCode: string | null;
  createdAt: string;
  timeZone: string;
  articleSlug: string;
  body: string;
}

export class CommentNotificationError extends Error {
  constructor(public readonly status: number | 'network') {
    super('Comment notification delivery failed');
    this.name = 'CommentNotificationError';
  }
}

export function commentNotificationIdempotencyKey(
  comment: Pick<PendingCommentNotification, 'environment' | 'id'>,
): string {
  return `comment-notification/${comment.environment || 'unknown'}/${comment.id}`;
}

export function buildCommentNotificationText(comment: PendingCommentNotification): string {
  const formatted = formatLocation(comment.country, comment.city, comment.regionCode);
  const location =
    formatted === '—'
      ? comment.country || '—'
      : comment.country
        ? `${formatted} (${comment.country})`
        : formatted;

  return [
    `Comment ID: ${comment.id}`,
    'Status: pending',
    `Author: ${comment.author}`,
    `Email: ${comment.email || '—'}`,
    `IP: ${comment.ip || '—'}`,
    `Location: ${location}`,
    `Timestamp: ${formatOwnerTimestamp(comment.createdAt, comment.timeZone || DEFAULT_TIMEZONE)}`,
    `Article/path: ${comment.articleSlug}`,
    `Comment: ${excerpt(comment.body)}`,
    '',
    `Moderation: ${COMMENT_MODERATION_URL}`,
  ].join('\n');
}

export async function sendCommentNotification(
  apiKey: string,
  comment: PendingCommentNotification,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  let response: Response;
  try {
    response = await fetcher(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'idempotency-key': commentNotificationIdempotencyKey(comment),
      },
      body: JSON.stringify({
        from: COMMENT_NOTIFICATION_FROM,
        to: [COMMENT_NOTIFICATION_TO],
        subject: COMMENT_NOTIFICATION_SUBJECT,
        text: buildCommentNotificationText(comment),
      }),
    });
  } catch {
    throw new CommentNotificationError('network');
  }

  if (!response.ok) throw new CommentNotificationError(response.status);
}

export function commentNotificationFailureStatus(error: unknown): number | 'network' {
  return error instanceof CommentNotificationError ? error.status : 'network';
}

function excerpt(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length > 320 ? `${compact.slice(0, 319)}…` : compact;
}
