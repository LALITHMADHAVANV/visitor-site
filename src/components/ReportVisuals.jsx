import React, { useEffect, useMemo, useState } from 'react';
import ReportChart from './ReportChart';
import HostDonut from './HostDonut';
import { duration, visitDay } from '../reportUtils';

export default function ReportVisuals({ rows, grouped, tab, onHost, onStatus, onReset }) {
    const [type, setType] = useState('bar');
    const [period, setPeriod] = useState('daily');
    const [highlightedDate, setHighlightedDate] = useState(null);
    useEffect(() => { setHighlightedDate(null); }, [rows, period, type]);
    const days = useMemo(() => {
        const counts = new Map();
        rows.forEach(v => { const day = visitDay(v); if (day) counts.set(day, (counts.get(day) || 0) + 1); });
        return [...counts].sort(([a], [b]) => a.localeCompare(b));
    }, [rows]);
    const entries = useMemo(() => {
        if (period === 'daily') return days;
        const counts = new Map();
        days.forEach(([day, count]) => counts.set(day.slice(0, 7), (counts.get(day.slice(0, 7)) || 0) + count));
        return [...counts];
    }, [days, period]);
    const peak = days.reduce((best, item) => !best || item[1] > best[1] ? item : best, null);
    const completed = rows.filter(v => duration(v) !== null).length;
    const statuses = [...new Set(rows.map(v => v.status || 'unknown'))].map(status => ({ name: ({ 'checked-in': 'Inside', 'checked-out': 'Checked out', registered: 'Registered', expected: 'Expected' })[status] || status, value: rows.filter(v => (v.status || 'unknown') === status).length, status }));
    const descriptions = {
        Overview: 'Host rankings, arrival trends, and visit status for all matching visits in one view.',
        'Visitor Log': 'Every matching visit. Select a bar to highlight it, or a host or status to narrow the report.',
        'Host Activity': 'Compare hosts by visit count. Select a donut segment or name to open their report.',
        'Repeat Visitors': 'Visits with an earlier recorded visit by the same phone number. Charts show repeat visits only.',
        'Visit Duration': 'Completed visits with valid entry and exit times. Visits still in progress are excluded.',
        Vehicles: 'Visits with a recorded vehicle number. Counts represent visits, not distinct vehicles.',
        'Accompanying Members': 'Group visits with extra members. Total people includes the primary visitor and accompanying members.'
    };
    const trendOption = {
        tooltip: { trigger: 'axis', renderMode: 'richText', axisPointer: { type: 'shadow' } },
        toolbox: { right: 8, feature: { saveAsImage: { title: 'Save chart', name: 'visitor-trends', type: 'svg' }, restore: { title: 'Reset filters and zoom' } } },
        grid: { left: 44, right: 20, top: 38, bottom: 65 },
        xAxis: { type: 'category', data: entries.map(([day]) => day), axisLabel: { hideOverlap: true, color: '#64748b' }, axisLine: { lineStyle: { color: '#e2e8f0' } } },
        yAxis: { type: 'value', minInterval: 1, name: 'Visits', splitLine: { lineStyle: { color: '#f1f5f9' } } },
        dataZoom: [{ type: 'inside', zoomOnMouseWheel: false }, { type: 'slider', height: 16, bottom: 10 }],
        series: [{
            name: 'Visits', type,
            data: entries.map(([date, count]) => ({
                value: count,
                itemStyle: { color: highlightedDate && highlightedDate !== date ? '#dbeafe' : '#2563eb' }
            })),
            barMaxWidth: 36,
            smooth: type === 'line',
            areaStyle: type === 'line' ? { opacity: 0.08 } : undefined,
            itemStyle: { color: '#2563eb' },
            emphasis: { focus: 'self', blurScope: 'series', itemStyle: { color: '#2563eb' } },
            blur: { itemStyle: { opacity: 0.25 } }
        }]
    };
    const statusOption = {
        tooltip: { trigger: 'item', renderMode: 'richText', formatter: '{b}: {c} visits ({d}%)' },
        series: [{
            name: 'Visit status', type: 'pie', radius: ['56%', '78%'], center: ['50%', '50%'],
            label: { show: true, position: 'inside', formatter: '{d}%', color: '#fff', fontWeight: 700, fontSize: 11 },
            emphasis: { scale: true }, data: statuses,
            itemStyle: { borderColor: '#fff', borderWidth: 3, borderRadius: 4 }
        }]
    };
    return <>
        <article className="report-insight" aria-live="polite"><div><strong>{tab} at a glance</strong><p>{descriptions[tab]}</p></div>{rows.length ? <div className="report-insight-facts"><span><b>{rows.length}</b> matching visits across <b>{grouped.length}</b> hosts</span>{peak && <span>Busiest date: <b>{peak[0]}</b> ({peak[1]} visits)</span>}{grouped[0] && <span>Leading host: <b>{grouped[0].host}</b> ({grouped[0].visits} visits)</span>}<span><b>{completed}</b> visits with completed durations</span></div> : <p>No visits match this report. Adjust the filters to explore another period.</p>}</article>
        <div className="reports-charts"><article className="report-panel"><div className="report-panel-title"><div><h3>Visitor trends</h3><p>{tab} | Dates in IST</p></div><div className="chart-controls">{highlightedDate && <button type="button" className="report-chart-reset" onClick={() => setHighlightedDate(null)}>Clear highlight</button>}<button type="button" className="report-chart-reset" onClick={onReset}>Reset chart filters</button><select aria-label="Trend grouping" value={period} onChange={e => setPeriod(e.target.value)}><option value="daily">Daily</option><option value="monthly">Monthly</option></select><div className="chart-toggle">{['bar', 'line'].map(t => <button key={t} aria-pressed={type === t} onClick={() => setType(t)} className={type === t ? 'active' : ''}>{t === 'bar' ? 'Bars' : 'Line'}</button>)}</div></div></div>{entries.length ? <ReportChart label="Visitor counts by date" option={trendOption} onReset={onReset} onClick={event => { if (event.componentType === 'series') setHighlightedDate(current => current === String(event.name) ? null : String(event.name)); }} /> : <div className="reports-empty">No dated visits to chart.</div>}<p className="chart-help">Hover for counts. Select a bar or point to highlight it and fade the others. Select it again to clear. Drag the slider to zoom.</p></article><HostDonut hosts={grouped} onSelect={onHost} onReset={onReset} /></div>
        <article className="report-panel report-status-chart"><div><div className="report-panel-title"><h3>Visit status</h3><button type="button" className="report-chart-reset" onClick={onReset}>Reset chart filters</button></div><p>How the {rows.length} matching visits are distributed.</p><p className="chart-help">Hover for counts and percentages. Select a segment to filter the report.</p><button className="report-link" onClick={() => onStatus('all')}>Show all statuses</button><div className="status-shortcuts">{statuses.map(s => <button key={s.status} onClick={() => onStatus(s.status)}>{s.name}: {s.value} ({(s.value / rows.length * 100).toFixed(1)}%)</button>)}</div></div>{rows.length ? <div className="report-donut"><ReportChart label="Matching visits by status" height={240} option={statusOption} onClick={e => { if (e.data?.status) onStatus(e.data.status); }} /><div className="report-donut-total" aria-hidden="true"><strong>{rows.length.toLocaleString('en-IN')}</strong><span>Matching visits</span></div></div> : <div className="reports-empty">No visit status data.</div>}</article>
    </>;
}
