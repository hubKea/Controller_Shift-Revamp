export function coerceDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') {
    try {
      return value.toDate();
    } catch (error) {
      return null;
    }
  }
  if (typeof value === 'number') {
    const candidate = new Date(value);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
  }
  if (typeof value === 'string') {
    const candidate = new Date(value);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
  }
  return null;
}

export function formatRelativeTime(input, { now = new Date() } = {}) {
  const targetDate = coerceDate(input);
  const nowDate = coerceDate(now) || new Date();

  if (!targetDate) {
    return 'just now';
  }

  const diffMs = nowDate.getTime() - targetDate.getTime();
  const diffSeconds = Math.round(diffMs / 1000);

  if (!Number.isFinite(diffSeconds) || diffSeconds < 0) {
    return 'just now';
  }

  if (diffSeconds < 45) return 'just now';
  if (diffSeconds < 90) return '1m ago';

  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 45) return `${diffMinutes}m ago`;
  if (diffMinutes < 90) return '1h ago';

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 22) return `${diffHours}h ago`;
  if (diffHours < 36) return '1d ago';

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 14) return '1w ago';

  const diffWeeks = Math.round(diffDays / 7);
  if (diffDays < 30) return `${diffWeeks}w ago`;
  if (diffDays < 45) return '1mo ago';

  const diffMonths = Math.round(diffDays / 30);
  if (diffDays < 360) return `${diffMonths}mo ago`;

  const diffYears = Math.round(diffDays / 365);
  return `${diffYears}y ago`;
}
