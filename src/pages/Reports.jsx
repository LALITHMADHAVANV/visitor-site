import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { hostKey, istDay, duration, extraMembers, cleanPurpose, selectVisits, summarize, repeatIds, selectReportVisits } from '../reportUtils';
import './Reports.css';
import ReportVisuals from '../components/ReportVisuals';

const tabs = ['Overview', 'Visitor Log', 'Host Activity', 'Repeat Visitors', 'Visit Duration', 'Vehicles', 'Accompanying Members'];
const reportPath = name => name === 'Overview' ? '/reports' : `/reports/${name.toLowerCase().replaceAll(' ', '-')}`;
const defaults = () => ({ from: `${istDay(new Date()).slice(0, 7)}-01`, to: istDay(new Date()), fromTime: '', toTime: '', host: '', status: 'all' });
const formatTime = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const statusText = v => ({ 'checked-in': 'Inside', 'checked-out': 'Checked out', registered: 'Registered', expected: 'Expected' }[v.status] || v.status || 'Unknown');

export default function Reports() {
    const { reportType } = useParams();
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const tab = tabs.find(name => reportPath(name) === (reportType ? `/reports/${reportType}` : '/reports'));
    const { user } = useAuth();
    const [all, setAll] = useState([]);
    const [hosts, setHosts] = useState([]);
    const filters = useMemo(() => {
        const initial = defaults();
        return Object.fromEntries(Object.keys(initial).map(key => [key, params.get(key) ?? initial[key]]));
    }, [params]);
    const setFilters = value => {
        const next = typeof value === 'function' ? value(filters) : value;
        setParams(new URLSearchParams(next));
    };
    const [draft, setDraft] = useState(filters);
    useEffect(() => { setDraft(filters); }, [filters]);
    const [search, setSearch] = useState('');
    const [chartReset, setChartReset] = useState(0);
    const resetFilters = () => {
        const cleared = { from: '', to: '', fromTime: '', toTime: '', host: '', status: 'all' };
        setDraft(cleared);
        setFilters(cleared);
        setSearch('');
        setPage(1);
        setChartReset(value => value + 1);
    };
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [exporting, setExporting] = useState('');
    const [refresh, setRefresh] = useState(0);
    const [updated, setUpdated] = useState(null);
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true); setError('');
        (async () => {
            try {
                const res = await fetch('/api/visitors?report=true', { signal: controller.signal });
                if (!res.ok) throw new Error('Unable to load report data. Please retry.');
                const data = await res.json();
                if (!Array.isArray(data)) throw new Error('Unexpected report response.');
                if (!controller.signal.aborted) { setAll(data); setUpdated(new Date()); }
                const hostRes = await fetch('/api/hosts', { signal: controller.signal });
                if (hostRes.ok) {
                    const items = await hostRes.json();
                    if (!controller.signal.aborted) setHosts(items.map(h => String(h.name || '').trim().toUpperCase()).filter(Boolean));
                }
            } catch (e) { if (e.name !== 'AbortError') setError(e.message); }
            finally { if (!controller.signal.aborted) setLoading(false); }
        })();
        return () => controller.abort();
    }, [refresh]);
    const hostOptions = useMemo(() => [...new Set([...hosts, ...all.map(hostKey)])].sort(), [hosts, all]);
    const selected = useMemo(() => selectVisits(all, filters), [all, filters]);
    const repeated = useMemo(() => repeatIds(all, filters.host), [all, filters.host]);
    // Cards, charts, table, and exports share the same report dataset.
    const rows = useMemo(() => selectReportVisits(selected, tab, repeated, search), [selected, tab, repeated, search]);
    const stats = summarize(rows);
    const inside = rows.filter(v => v.status === 'checked-in').length;
    const grouped = useMemo(() => {
        const map = new Map();
        rows.forEach(v => { const key = hostKey(v); map.set(key, [...(map.get(key) || []), v]); });
        return [...map].map(([host, visits]) => ({ host, ...summarize(visits) })).sort((a, b) => b.visits - a.visits);
    }, [rows]);
    useEffect(() => { setPage(1); }, [filters, tab, search]);
    const openHost = host => {
        navigate({ pathname: reportPath('Host Activity'), search: new URLSearchParams({ ...filters, host }).toString() });
        setSearch('');
    };
    const columns = ['Visitor ID', 'Visitor', 'Company', 'Host', 'Purpose', 'Check-in (IST)', 'Check-out (IST)', 'Duration (min)', 'Status', 'Vehicle', 'Extra members'];
    const exportRow = v => [v.visitorNo || v.id || '', v.name || '', v.company || '', hostKey(v), cleanPurpose(v), formatTime(v.checkInTime), formatTime(v.checkOutTime), duration(v) === null ? '' : Math.round(duration(v)), statusText(v), v.vehicleNo || '', extraMembers(v)];
    async function exportReport(type) {
        if (user?.role !== 'admin' || !rows.length) return;
        setExporting(type); setError('');
        try {
            const name = `Esstee_${(filters.host || 'All_hosts').replace(/[^a-z0-9]/gi, '_')}_${tab.replaceAll(' ', '_')}_${filters.from || 'start'}_${filters.to || 'latest'}`;
            const scope = `${filters.host || 'All hosts'} | ${filters.from || 'All dates'} to ${filters.to || 'latest'} | Arrival time: ${filters.fromTime || '00:00'} to ${filters.toTime || '23:59'} IST each day | ${filters.status} | Search: ${search || 'none'}`;
            if (type === 'Excel') {
                const XLSX = await import('xlsx');
                const book = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Esstee Exports — ' + tab], [scope], ['Times shown in IST. Includes all matching rows.'], [], columns, ...rows.map(exportRow)]), 'Visitors');
                XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(grouped), 'Host summary');
                XLSX.writeFile(book, `${name}.xlsx`);
            } else {
                const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
                const doc = new jsPDF({ orientation: 'landscape' });
                doc.setFontSize(16); doc.text(`Esstee Exports | ${tab}`, 14, 16);
                doc.setFontSize(9); const lines = doc.splitTextToSize(scope, 265); doc.text(lines, 14, 24);
                autoTable(doc, { startY: 29 + lines.length * 4, head: [columns], body: rows.map(exportRow), styles: { fontSize: 7 }, headStyles: { fillColor: [37, 99, 235] }, didDrawPage: () => { doc.setFontSize(8); doc.text(`Times in IST | Page ${doc.internal.getNumberOfPages()}`, 14, 202); } });
                doc.save(`${name}.pdf`);
            }
        } catch (e) { setError(`Export failed: ${e.message}`); }
        finally { setExporting(''); }
    }
    const pages = Math.max(1, Math.ceil(rows.length / 20));
    const currentPage = Math.min(page, pages);
    if (!tab) return <Navigate to={{ pathname: '/reports', search: `?${params}` }} replace />;
    return <section className="reports-page">
        <nav className="reports-tabs" aria-label="Report type">{tabs.map(t => <Link key={t} to={{ pathname: reportPath(t), search: new URLSearchParams(filters).toString() }} aria-current={tab === t ? 'page' : undefined} className={tab === t ? 'active' : ''}>{t}</Link>)}</nav>
        <div className="reports-controls glass-panel"><form className="reports-filters" onSubmit={e => { e.preventDefault(); if (draft.from && draft.to && draft.from > draft.to) return; setFilters({ ...draft }); }}>
            <label>Host<select value={draft.host} onChange={e => setDraft({ ...draft, host: e.target.value })}><option value="">All hosts</option>{hostOptions.map(h => <option key={h}>{h}</option>)}</select></label>
            <label>From (IST)<input type="date" value={draft.from} max={draft.to || undefined} onChange={e => setDraft({ ...draft, from: e.target.value })} /></label>
            <label>To (IST)<input type="date" value={draft.to} min={draft.from || undefined} onChange={e => setDraft({ ...draft, to: e.target.value })} /></label>
            <label>From time (IST)<input type="time" value={draft.fromTime} onChange={e => setDraft({ ...draft, fromTime: e.target.value })} /></label>
            <label>To time (IST)<input type="time" value={draft.toTime} onChange={e => setDraft({ ...draft, toTime: e.target.value })} /></label>
            <label>Status<select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })}><option value="all">All statuses</option><option value="checked-in">Inside</option><option value="checked-out">Checked out</option><option value="registered">Registered</option><option value="expected">Expected</option></select></label>
            <button className="btn btn-primary" disabled={loading}>Apply filters</button><button type="button" className="btn btn-secondary" onClick={resetFilters}>Reset all</button>
        </form><div className="reports-actions"><button className="btn btn-secondary" onClick={() => setRefresh(n => n + 1)} disabled={loading}>Refresh</button>{user?.role === 'admin' && ['Excel', 'PDF'].map(type => <button key={type} className="btn btn-secondary btn-sm" disabled={loading || !!error || !!exporting || !rows.length} onClick={() => exportReport(type)}>{exporting === type ? 'Exporting…' : `Export ${type}`}</button>)}</div></div>
        <p className="report-time-note">Time filters use arrival time in IST on each selected date (registration time when check-in is unavailable). An end time earlier than the start includes the overnight hours.</p>
        {error && <div className="reports-error" role="alert">{error} <button onClick={() => setRefresh(n => n + 1)}>Retry</button></div>}
        {loading ? <div className="reports-empty" role="status">Loading visitor reports…</div> : <>
        {filters.host && <div className="reports-host"><span className="reports-avatar">{filters.host.slice(0, 2)}</span><div><strong>{filters.host}</strong><p>Selected host</p></div><button onClick={() => openHost('')}>Compare all hosts →</button></div>}
        <div className="reports-metrics">{[['Total visits', stats.visits, 'Selected period | current report'], ['Total people', stats.people, 'Includes accompanying members'], ['Currently inside', inside, 'Matching visits | selected period'], ['Avg. completed visit', stats.average === null ? '—' : `${stats.average} min`, 'Completed visits | current report']].map(([title, value, note], i) => <article key={title} className="report-card"><span className={`report-icon icon-${i}`}><i className={`fa-solid ${['fa-users', 'fa-user-group', 'fa-door-open', 'fa-clock'][i]}`} /></span><span>{title}</span><strong>{value}</strong><small>{note}</small></article>)}</div>
        <div className="report-active-filters" aria-live="polite"><span>{filters.host || 'All hosts'}</span><span>{filters.from || 'Beginning'} to {filters.to || 'Latest'}</span><span>Time: {filters.fromTime || '00:00'} to {filters.toTime || '23:59'} IST daily</span><span>{filters.status === 'all' ? 'All statuses' : statusText({ status: filters.status })}</span>{search && <span>Search: {search}</span>}<button type="button" className="report-link" onClick={resetFilters}>Clear filters</button></div>
        <ReportVisuals key={chartReset} rows={rows} grouped={grouped} tab={tab} onReset={resetFilters} onHost={openHost} onStatus={status => setFilters({ ...filters, status })} />
        {tab === 'Host Activity' && !filters.host && <article className="report-panel">
            <div className="report-panel-title"><div><h3>Total visits by host</h3><p>Total visitors includes accompanying members.</p></div></div>
            <div className="reports-table-wrap"><table>
                <thead><tr><th>S.No</th><th>Host Name</th><th>Total Visitors</th></tr></thead>
                <tbody>{grouped.map((host, index) => <tr key={host.host}>
                    <td>{index + 1}</td>
                    <td><button className="report-link" onClick={() => openHost(host.host)}>{host.host}</button></td>
                    <td>{host.people}</td>
                </tr>)}</tbody>
            </table></div>
            {!grouped.length && <div className="reports-empty">No host visits match these filters.</div>}
        </article>}
        <article className="report-panel report-log"><div className="report-panel-title"><div><h3>{tab === 'Overview' || tab === 'Host Activity' ? 'Visitor log' : tab}</h3><p>{rows.length} matching visits · {filters.from || 'All dates'} to {filters.to || 'latest'}{filters.host ? ` · ${filters.host}` : ' · All hosts'}</p></div><input className="reports-search" aria-label="Search report" placeholder="Search visitor, company, purpose…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        {tab === 'Repeat Visitors' && <p className="report-note">Includes visits with an earlier recorded visit by the same phone number{filters.host ? ' to this host' : ''}. Records without phone numbers are excluded.</p>}
        {tab === 'Visit Duration' && <p className="report-note">Completed visits with valid check-in and check-out times only.</p>}
        <div className="reports-table-wrap"><table><thead><tr>{['Visitor', 'Company', 'Host', 'Purpose', 'Check-in · IST', 'Check-out · IST', 'Duration', 'Status', ...(tab === 'Vehicles' ? ['Vehicle'] : []), ...(tab === 'Accompanying Members' ? ['Extra members', 'Total people'] : [])].map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{rows.slice((currentPage - 1) * 20, currentPage * 20).map((v, i) => <tr key={v.id || v._id || i}><td><strong>{v.name || 'Unnamed visitor'}</strong><small>{v.visitorNo || v.id}</small></td><td>{v.company || '—'}</td><td><button className="report-link" onClick={() => openHost(hostKey(v))}>{hostKey(v)}</button></td><td>{cleanPurpose(v) || '—'}</td><td>{formatTime(v.checkInTime)}</td><td>{formatTime(v.checkOutTime)}</td><td>{duration(v) !== null ? `${Math.round(duration(v))} min` : v.status === 'checked-in' ? 'In progress' : '—'}</td><td><span className={`report-status ${v.status}`}>{statusText(v)}</span></td>{tab === 'Vehicles' && <td>{v.vehicleNo}</td>}{tab === 'Accompanying Members' && <><td>{extraMembers(v)}</td><td>{1 + extraMembers(v)}</td></>}</tr>)}</tbody></table></div>
        {!rows.length && <div className="reports-empty">No matching visits. Try another host, date range, or report type.</div>}
        <div className="reports-pagination"><span>{rows.length ? `Showing ${(currentPage - 1) * 20 + 1}–${Math.min(currentPage * 20, rows.length)} of ${rows.length}` : '0 visits'} · Times shown in IST</span><div><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>{currentPage} / {pages}</span><button disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button></div></div></article>
        <p className="reports-updated">Updated {formatTime(updated)} · Refresh to retrieve the latest activity. Exports include every matching row, across all pages.</p>
        </>}
    </section>;
}
