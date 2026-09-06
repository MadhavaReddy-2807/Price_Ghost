/**
 * Sanitizes and extracts a clean floating-point price from raw strings like "₹ 1,49,999.00", "Rs. 24,990", etc.
 * @param {string|number} raw 
 * @returns {number}
 */
export function sanitizePriceString(raw) {
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
  if (!raw) return 0;
  const cleaned = String(raw).replace(/,/g, '').replace(/[^0-9.]/g, ' ').trim();
  const match = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (!match) return 0;
  const parsed = parseFloat(match[1]);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Calculates the percentage price drop from baseline to current price.
 * @param {number} baselinePrice 
 * @param {number} currentPrice 
 * @returns {number} Percentage drop (0 - 100) rounded to 2 decimal places
 */
export function calculateDropPercentage(baselinePrice, currentPrice) {
  if (!baselinePrice || baselinePrice <= 0 || !currentPrice || currentPrice <= 0) return 0;
  if (currentPrice >= baselinePrice) return 0;
  const drop = ((baselinePrice - currentPrice) / baselinePrice) * 100;
  return Math.round(drop * 100) / 100;
}

/**
 * Calculates the target buy price given a baseline price and required percentage drop.
 * @param {number} baselinePrice 
 * @param {number} targetPercentageDrop 
 * @returns {number} Target price rounded to 2 decimal places
 */
export function calculateTargetPrice(baselinePrice, targetPercentageDrop) {
  if (!baselinePrice || baselinePrice <= 0) return 0;
  const drop = Math.max(0, Math.min(100, targetPercentageDrop || 0));
  const target = baselinePrice * (1 - drop / 100);
  return Math.round(target * 100) / 100;
}

/**
 * Checks whether the current time falls inside a user-defined quiet hours window (e.g. "22:00" to "08:00").
 * Correctly accounts for overnight spans crossing midnight.
 * @param {string} start "HH:MM"
 * @param {string} end "HH:MM"
 * @param {Date} [date=new Date()]
 * @returns {boolean}
 */
export function isInQuietHours(start, end, date = new Date()) {
  if (!start || !end) return false;
  const [startHour, startMin] = start.split(':').map(Number);
  const [endHour, endMin] = end.split(':').map(Number);
  if (isNaN(startHour) || isNaN(endHour)) return false;

  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const startMinutes = startHour * 60 + (startMin || 0);
  const endMinutes = endHour * 60 + (endMin || 0);

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    // Crosses midnight (e.g. 22:00 to 08:00)
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
}

/**
 * Evaluates whether an email notification should be sent to a tracking user.
 * @param {Object} params
 * @param {number} params.currentPrice
 * @param {number} params.baselinePrice
 * @param {number} params.targetPercentageDrop
 * @param {number|null} [params.lastNotifiedPrice]
 * @param {string} [params.quietHoursStart]
 * @param {string} [params.quietHoursEnd]
 * @param {Date|string} [params.lastNotifiedAt]
 * @param {number} [params.minIntervalMinutes=60]
 * @param {Date} [params.date]
 * @returns {boolean}
 */
export function shouldNotifyUser({
  currentPrice,
  baselinePrice,
  targetPercentageDrop,
  lastNotifiedPrice,
  lastNotifiedAt,
  minIntervalMinutes = 60,
  quietHoursStart,
  quietHoursEnd,
  date = new Date(),
  ignoreQuietHours = false,
}) {
  if (currentPrice <= 0 || baselinePrice <= 0) return false;

  const dropPercent = calculateDropPercentage(baselinePrice, currentPrice);
  if (dropPercent < (targetPercentageDrop || 10)) return false;

  // Spam prevention 1: Do not re-notify if price has not dropped below previous notification
  if (lastNotifiedPrice !== undefined && lastNotifiedPrice !== null) {
    if (currentPrice >= lastNotifiedPrice) return false;
  }

  // Spam prevention 2: Minimum cooldown interval between successive alerts for the same item
  if (lastNotifiedAt && minIntervalMinutes > 0) {
    const elapsedMinutes = (date.getTime() - new Date(lastNotifiedAt).getTime()) / (1000 * 60);
    if (elapsedMinutes < minIntervalMinutes) {
      return false;
    }
  }

  // Quiet hours suppression (only if not explicitly ignored for persistent queueing)
  if (!ignoreQuietHours && quietHoursStart && quietHoursEnd && isInQuietHours(quietHoursStart, quietHoursEnd, date)) {
    return false;
  }

  return true;
}

/**
 * Returns the timestamp of the most recently sent email from the user's mail queue.
 * @param {Object} user
 * @returns {Date|null}
 */
export function getLastSentEmailTimestamp(user) {
  if (!user || !user.mailQueue || user.mailQueue.length === 0) return null;
  const sentJobs = user.mailQueue.filter((j) => j.status === 'sent' && j.sentAt);
  if (sentJobs.length === 0) return null;
  return new Date(Math.max(...sentJobs.map((j) => new Date(j.sentAt).getTime())));
}

/**
 * Evaluates whether a user's mail queue is eligible for delivery according to:
 * 1. Quiet hours window (e.g. 22:00 - 08:00)
 * 2. User-configured batch frequency schedule ('realtime', '6h', '12h', '24h')
 *
 * @param {Object} user
 * @param {Date} [date=new Date()]
 * @returns {{ eligible: boolean, reason?: string, inQuietHours?: boolean, remainingMinutes?: number, frequency?: string }}
 */
export function isUserEligibleForScheduledDelivery(user, date = new Date()) {
  if (!user || user.notifications?.email === false) {
    return { eligible: false, reason: 'Email alerts disabled in user preferences.' };
  }

  // 1. Quiet Hours check
  const { quietHoursStart, quietHoursEnd } = user.notifications || {};
  if (quietHoursStart && quietHoursEnd && isInQuietHours(quietHoursStart, quietHoursEnd, date)) {
    return {
      eligible: false,
      reason: `Quiet hours active (${quietHoursStart} - ${quietHoursEnd}). Delivery deferred in queue.`,
      inQuietHours: true,
    };
  }

  // 2. Frequency schedule check
  const frequency = user.notifications?.frequency || 'realtime';
  if (frequency === 'realtime') {
    return { eligible: true, frequency: 'realtime' };
  }

  const frequencyCooldownMs = {
    '6h': 6 * 60 * 60 * 1000,
    '12h': 12 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
  }[frequency];

  if (!frequencyCooldownMs) {
    return { eligible: true, frequency };
  }

  const lastSentAt = getLastSentEmailTimestamp(user);
  if (lastSentAt) {
    const elapsedMs = date.getTime() - lastSentAt.getTime();
    if (elapsedMs < frequencyCooldownMs) {
      const remainingMinutes = Math.ceil((frequencyCooldownMs - elapsedMs) / (60 * 1000));
      return {
        eligible: false,
        reason: `Mailing schedule (${frequency}) active. Next batch in ${remainingMinutes}m.`,
        remainingMinutes,
        frequency,
      };
    }
  }

  return { eligible: true, frequency };
}
