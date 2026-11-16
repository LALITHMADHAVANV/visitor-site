export const REGISTRATION_TIMEOUT_MS = 10 * 60 * 1000;

export function isExpiredRegistration(visitor, now = Date.now()) {
    if (visitor.status !== 'registered') return false;
    const expiresAt = visitor.registrationExpiresAt
        ? new Date(visitor.registrationExpiresAt).getTime()
        : new Date(visitor.created_at).getTime() + REGISTRATION_TIMEOUT_MS;
    return Number.isFinite(expiresAt) && expiresAt <= now;
}
