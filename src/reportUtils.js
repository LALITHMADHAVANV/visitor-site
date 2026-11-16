export const hostKey = v => String(v.hostName || v.hostname || 'Unassigned').trim().toUpperCase();
export function istDay(value) {
    const d = new Date(value);
    return value && Number.isFinite(d.getTime()) ? new Date(d.getTime() + 19800000).toISOString().slice(0, 10) : '';
}
export const visitDay = v => istDay(v.checkInTime || v.created_at);
export const identity = v => {
    const phone = String(v.phone || '').replace(/\D/g, '');
    return phone ? `phone:${phone.length >= 10 ? phone.slice(-10) : phone}` : `visit:${v.id || v._id}`;
};
export function extraMembers(v) {
    const explicit = Number(v.extraMembersCount);
    const legacy = String(v.purpose || '').match(/\[Extra:\s*(\d+)\s*Members?/i);
    return Math.max(0, Number.isFinite(explicit) ? Math.floor(explicit) : Number(legacy?.[1] || 0));
}
export function duration(v) {
    if (!v.checkInTime || !v.checkOutTime) return null;
    const minutes = (new Date(v.checkOutTime) - new Date(v.checkInTime)) / 60000;
    return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
}
export function hasVehicle(v) {
    return Boolean(v.vehicleNo && !/^(no|none|n\/a|-)$/i.test(v.vehicleNo.trim()));
}
export const cleanPurpose = v => String(v.purpose || '').replace(/\[(ID|Vehicle|Extra):[^\]]*\]/gi, '').trim();
export function selectReportVisits(selected, tab, repeated, search = '') {
    return selected.filter(v =>
        (tab !== 'Repeat Visitors' || repeated.has(v.id || v._id))
        && (tab !== 'Vehicles' || hasVehicle(v))
        && (tab !== 'Accompanying Members' || extraMembers(v) > 0)
        && (tab !== 'Visit Duration' || duration(v) !== null)
        && (!search || [v.name, v.company, hostKey(v), cleanPurpose(v), v.visitorNo, v.id, v.vehicleNo]
            .some(s => String(s || '').toLowerCase().includes(search.toLowerCase())))
    ).sort((a, b) => new Date(b.checkInTime || b.created_at) - new Date(a.checkInTime || a.created_at));
}
export function selectVisits(all, filters) {
    return all.filter(v => {
        const day = visitDay(v);
        if (filters.fromTime || filters.toTime) {
            if (!day) return false;
            const visitTime = new Date(new Date(v.checkInTime || v.created_at).getTime() + 19800000)
                .toISOString().slice(11, 16);
            const fromTime = filters.fromTime || '00:00';
            const toTime = filters.toTime || '23:59';
            // An overnight window includes late evening and early morning on each selected date.
            const withinTime = fromTime <= toTime
                ? visitTime >= fromTime && visitTime <= toTime
                : visitTime >= fromTime || visitTime <= toTime;
            if (!withinTime) return false;
        }
        return (!filters.host || hostKey(v) === filters.host)
            && (!filters.from || day >= filters.from) && (!filters.to || (day && day <= filters.to))
            && (filters.status === 'all' || v.status === filters.status);
    });
}
export function summarize(rows) {
    const times = rows.map(duration).filter(n => n !== null);
    return { visits: rows.length, people: rows.reduce((n, v) => n + 1 + extraMembers(v), 0),
        average: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null };
}
// A repeat visit requires an earlier dated visit to this host (or any host in overview).
export function repeatIds(all, host) {
    const seen = new Set(); const repeated = new Set();
    [...all].filter(v => !host || hostKey(v) === host).sort((a, b) =>
        new Date(a.checkInTime || a.created_at) - new Date(b.checkInTime || b.created_at)).forEach(v => {
        if (!v.phone || !visitDay(v)) return;
        const key = identity(v);
        if (seen.has(key)) repeated.add(v.id || v._id);
        seen.add(key);
    });
    return repeated;
}
