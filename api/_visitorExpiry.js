import { REGISTRATION_TIMEOUT_MS } from '../src/visitorExpiry.js';

export async function removeExpiredRegistrations(collection, now = new Date()) {
    // Give existing registrations a BSON Date for MongoDB's background TTL monitor.
    await collection.updateMany(
        { status: 'registered', registrationExpiresAt: { $exists: false } },
        [{ $set: { registrationExpiresAt: { $add: [
            { $convert: { input: '$created_at', to: 'date', onError: now, onNull: now } },
            REGISTRATION_TIMEOUT_MS
        ] } } }]
    );
    // Enforce the deadline on requests as well as MongoDB's periodic TTL sweep.
    return collection.deleteMany({ status: 'registered', registrationExpiresAt: { $lte: now } });
}
