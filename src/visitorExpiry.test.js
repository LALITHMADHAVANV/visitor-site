import test from 'node:test';
import assert from 'node:assert/strict';
import { isExpiredRegistration, REGISTRATION_TIMEOUT_MS } from './visitorExpiry.js';
import { removeExpiredRegistrations } from '../api/_visitorExpiry.js';

test('only pending registrations expire at ten minutes, including older records', () => {
    const created = Date.parse('2026-11-16T04:00:00Z');
    const visitor = { status: 'registered', created_at: new Date(created).toISOString() };
    assert.equal(isExpiredRegistration(visitor, created + REGISTRATION_TIMEOUT_MS - 1), false);
    assert.equal(isExpiredRegistration(visitor, created + REGISTRATION_TIMEOUT_MS), true);
    for (const status of ['checked-in', 'checked-out', 'expected']) {
        assert.equal(isExpiredRegistration({ ...visitor, status }, created + 99999999), false);
    }
    assert.equal(isExpiredRegistration({ status: 'registered' }), false);
    assert.equal(isExpiredRegistration({ ...visitor, registrationExpiresAt: new Date(created + 1200000) }, created + REGISTRATION_TIMEOUT_MS), false);
});

test('database cleanup migrates legacy registrations and deletes only expired registered records', async () => {
    const now = new Date('2026-11-16T04:10:00Z');
    const calls = [];
    const collection = {
        async updateMany(filter, update) { calls.push(['migrate', filter, update]); },
        async deleteMany(filter) { calls.push(['delete', filter]); return { deletedCount: 1 }; }
    };
    assert.deepEqual(await removeExpiredRegistrations(collection, now), { deletedCount: 1 });
    assert.deepEqual(calls[0][1], { status: 'registered', registrationExpiresAt: { $exists: false } });
    const expression = calls[0][2][0].$set.registrationExpiresAt.$add;
    assert.equal(expression[1], REGISTRATION_TIMEOUT_MS);
    assert.equal(expression[0].$convert.input, '$created_at');
    assert.deepEqual(calls[1][1], { status: 'registered', registrationExpiresAt: { $lte: now } });
});
