import type { GateLogEntry, StaffRequest, Visitor } from './types';

export interface ActivityRow {
  id: string;
  person: string;
  personId: string;
  department: string;
  type: string;
  status: string;
  at: string;
  endDate?: string;
  end?: string;
  host?: string;
  company?: string;
  vehicle?: string;
  members: number;
  minutes?: number;
  lateMinutes: number;
  identity?: string;
}
export interface ActivityFilters {
  from: string;
  to: string;
  fromTime: string;
  toTime: string;
  person: string;
  department: string;
  status: string;
  search: string;
}
export const emptyFilters: ActivityFilters = { from: '', to: '', fromTime: '', toTime: '', person: '', department: '', status: '', search: '' };

export function istParts(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return { day: '', time: '' };
  const local = new Date(timestamp + 19800000).toISOString();
  return { day: local.slice(0, 10), time: local.slice(11, 16) };
}
function duration(start?: string, end?: string) {
  if (!start || !end) return undefined;
  const minutes = (Date.parse(end) - Date.parse(start)) / 60000;
  return Number.isFinite(minutes) && minutes >= 0 ? Math.round(minutes) : undefined;
}
function scheduledTime(request: StaffRequest) {
  const date = request.startDate || request.date;
  const time = request.fromTime || request.timeOut || '';
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!date || !match) return request.appliedAt;
  let hours = Number(match[1]);
  if (match[3]) hours = hours % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return `${date}T${String(hours).padStart(2, '0')}:${match[2]}:00+05:30`;
}
export function staffRow(request: StaffRequest): ActivityRow {
  return {
    id: request.id, person: request.employeeName, personId: request.employeeId,
    department: request.department || 'Unassigned', type: request.type, status: request.status,
    at: request.actualDepartureTime || scheduledTime(request), end: request.actualReturnTime,
    endDate: request.endDate || request.date,
    minutes: duration(request.actualDepartureTime, request.actualReturnTime),
    lateMinutes: Math.max(0, request.lateMinutes || 0), members: 0
  };
}
export function gateRow(log: GateLogEntry): ActivityRow {
  return { id: log.id, person: log.employeeName, personId: log.employeeId,
    department: log.department || 'Unassigned', type: log.type, status: log.action,
    at: log.timestamp, lateMinutes: Math.max(0, log.delayMinutes || (log.isLate ? 1 : 0)), members: 0 };
}
export function visitorRow(visitor: Visitor): ActivityRow {
  const phone = (visitor.phone || '').replace(/\D/g, '');
  return {
    id: visitor.visitorNo || visitor.id, person: visitor.name, personId: visitor.id,
    department: visitor.hostDepartment || 'Unassigned', type: 'VISITOR', status: visitor.status,
    at: visitor.checkInTime || visitor.created_at, end: visitor.checkOutTime,
    host: visitor.hostName?.trim().toUpperCase() || 'UNASSIGNED', company: visitor.company,
    vehicle: visitor.vehicleNo, members: Math.max(0, Math.floor(Number(visitor.extraMembersCount) || 0)),
    minutes: duration(visitor.checkInTime, visitor.checkOutTime), lateMinutes: 0,
    identity: phone ? phone.slice(-10) : undefined
  };
}
export function repeatVisitIds(rows: ActivityRow[]) {
  const seen = new Set<string>();
  const ids = new Set<string>();
  [...rows].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).forEach(row => {
    if (!row.identity || !Number.isFinite(Date.parse(row.at))) return;
    if (seen.has(row.identity)) ids.add(row.id);
    seen.add(row.identity);
  });
  return ids;
}
export function filterActivity(rows: ActivityRow[], filters: ActivityFilters) {
  return rows.filter(row => {
    const { day, time } = istParts(row.at);
    if (filters.from && (!day || (row.endDate || day) < filters.from)) return false;
    if (filters.to && (!day || day > filters.to)) return false;
    if (filters.person && (row.host || row.personId) !== filters.person) return false;
    if (filters.department && row.department !== filters.department) return false;
    if (filters.status && row.status !== filters.status) return false;
    if (filters.fromTime || filters.toTime) {
      if (!time) return false;
      const start = filters.fromTime || '00:00';
      const end = filters.toTime || '23:59';
      const matches = start <= end ? time >= start && time <= end : time >= start || time <= end;
      if (!matches) return false;
    }
    return `${row.id} ${row.person} ${row.host || ''} ${row.company || ''} ${row.department}`
      .toLowerCase().includes(filters.search.toLowerCase());
  });
}
export function activityGroups(rows: ActivityRow[]) {
  const groups = new Map<string, { name: string; visits: number; people: number; key: string }>();
  rows.forEach(row => {
    const key = row.host || row.personId;
    const group = groups.get(key) || { key, name: row.host || row.person, visits: 0, people: 0 };
    group.visits++;
    group.people += 1 + row.members;
    groups.set(key, group);
  });
  return [...groups.values()].sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name));
}
