import test from 'node:test';
import assert from 'node:assert/strict';
import { istDay, selectVisits, summarize, repeatIds, extraMembers, duration, hasVehicle, cleanPurpose, selectReportVisits, visitDay } from './reportUtils.js';

test('IST date boundary and host filters use the visit date, not creation date', () => {
    const v = { id: '1', hostName: ' Priya ', checkInTime: '2026-11-01T19:00:00Z', created_at: '2026-10-25', status: 'checked-in' };
    assert.equal(istDay(v.checkInTime), '2026-11-02');
    assert.equal(selectVisits([v], { host: 'PRIYA', from: '2026-11-02', to: '2026-11-02', status: 'all' }).length, 1);
    assert.equal(selectVisits([v], { host: 'ARUN', status: 'all' }).length, 0);
    assert.equal(selectVisits([v], { status: 'checked-out' }).length, 0);
});
test('people count includes legacy members and average excludes incomplete or invalid durations', () => {
    const completed = { checkInTime: '2026-11-01T09:00Z', checkOutTime: '2026-11-01T10:00Z', extraMembersCount: 2 };
    const legacy = { purpose: 'Meeting [Extra: 3 Members (A, B, C)] [ID: Passport - secret]' };
    assert.equal(extraMembers(legacy), 3);
    assert.deepEqual(summarize([completed, legacy]), { visits: 2, people: 7, average: 60 });
    assert.equal(duration({ ...completed, checkOutTime: '2026-11-01T08:00Z' }), null);
    assert.equal(cleanPurpose(legacy), 'Meeting');
    assert.equal(hasVehicle({ vehicleNo: 'No' }), false);
});
test('repeat visits use earlier history and selected host, normalizing Indian phone prefixes', () => {
    const all = [
        { id: 'a', hostName: 'Priya', phone: '+91 98765 43210', checkInTime: '2026-10-01' },
        { id: 'b', hostName: 'Priya', phone: '9876543210', checkInTime: '2026-11-01' },
        { id: 'c', hostName: 'Arun', phone: '9876543210', checkInTime: '2026-11-02' },
        { id: 'd', hostName: 'Priya', checkInTime: '2026-11-03' }
    ];
    assert.deepEqual([...repeatIds(all, 'PRIYA')], ['b']);
    assert.deepEqual([...repeatIds(all, '')], ['b', 'c']);
});

test('each report scopes totals, chart buckets and host counts to its matching visits', () => {
    const all = [
        { id: 'old', hostName: 'Priya', phone: '1234567890', checkInTime: '2026-10-01' },
        { id: 'repeat', name: 'Amit', hostName: 'Priya', phone: '1234567890', checkInTime: '2026-11-01T09:00Z', checkOutTime: '2026-11-01T10:00Z', vehicleNo: 'TN01', extraMembersCount: 2, status: 'checked-out' },
        { id: 'new', name: 'Neha', hostName: 'Arun', phone: '9876543210', checkInTime: '2026-11-02T09:00Z', status: 'checked-in' }
    ];
    const selected = selectVisits(all, { from: '2026-11-01', to: '2026-11-30', status: 'all' });
    const repeated = repeatIds(all, '');
    for (const tab of ['Repeat Visitors', 'Visit Duration', 'Vehicles', 'Accompanying Members']) {
        const rows = selectReportVisits(selected, tab, repeated);
        assert.deepEqual(rows.map(v => v.id), ['repeat'], tab);
        assert.deepEqual(summarize(rows), { visits: 1, people: 3, average: 60 }, tab);
        assert.deepEqual(rows.map(visitDay), ['2026-11-01'], tab);
        assert.deepEqual(rows.map(v => v.hostName), ['Priya'], tab);
        assert.equal(rows.filter(v => v.status === 'checked-in').length, 0, tab);
    }
    for (const tab of ['Overview', 'Visitor Log', 'Host Activity']) {
        assert.equal(selectReportVisits(selected, tab, repeated).length, 2, tab);
    }
    assert.equal(selectReportVisits(selected, 'Repeat Visitors', repeated, 'Neha').length, 0);
    assert.deepEqual(summarize([]), { visits: 0, people: 0, average: null });
});

test('arrival time windows use IST, include the end minute, and support overnight hours', () => {
    const all = [
        { id: 'before', checkInTime: '2026-11-01T03:29:00Z' },
        { id: 'start', checkInTime: '2026-11-01T03:30:00Z' },
        { id: 'end', checkInTime: '2026-11-01T11:30:59Z' },
        { id: 'after', checkInTime: '2026-11-01T11:31:00Z' },
        { id: 'night', checkInTime: '2026-11-01T17:30:00Z' },
        { id: 'morning', created_at: '2026-11-01T23:30:00Z' },
        { id: 'invalid', checkInTime: 'invalid' }
    ];
    const base = { status: 'all', from: '2026-11-01', to: '2026-11-02' };
    const ids = filters => selectVisits(all, { ...base, ...filters }).map(v => v.id);
    assert.deepEqual(ids({ fromTime: '09:00', toTime: '17:00' }), ['start', 'end']);
    assert.deepEqual(ids({ fromTime: '22:00', toTime: '06:00' }), ['night', 'morning']);
    assert.deepEqual(ids({ toTime: '06:00' }), ['morning']);
    assert.deepEqual(ids({ fromTime: '22:00' }), ['night']);
    assert.deepEqual(ids({ fromTime: '', toTime: '' }), ['before', 'start', 'end', 'after', 'night', 'morning']);
});
