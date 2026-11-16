import React from 'react';
import ReportChart from './ReportChart';
const colors = ['#2563eb', '#0891b2', '#7c3aed', '#f59e0b', '#059669'];
export default function HostDonut({ hosts, onSelect, onReset }) {
    const top = hosts.slice(0, 5);
    const total = top.reduce((sum, h) => sum + h.visits, 0);
    return <article className="report-panel"><div className="report-panel-title"><div><h3>Top 5 hosts by visits</h3><p>Ranked by matching visits</p></div><button type="button" className="report-chart-reset" onClick={onReset}>Reset chart filters</button></div>{total ? <>
        <div className="report-donut"><ReportChart label="Top five hosts by visit count" height={240} option={{ tooltip: { trigger: 'item', renderMode: 'richText', formatter: '{b}: {c} visits ({d}%)' }, series: [{ name: 'Host visits', type: 'pie', radius: ['56%', '78%'], center: ['50%', '50%'], label: { show: false }, itemStyle: { borderWidth: 3, borderColor: '#fff', borderRadius: 5 }, emphasis: { scale: true, scaleSize: 5 }, data: top.map(h => ({ name: h.host, value: h.visits })) }] }} onClick={e => { if (e.componentType === 'series') onSelect(e.name); }} /><div className="report-donut-total" aria-hidden="true"><strong>{total.toLocaleString('en-IN')}</strong><span>Top host visits</span></div></div>
        <div className="host-donut-legend">{top.map((h, i) => <button key={h.host} onClick={() => onSelect(h.host)}><span className="host-donut-dot" style={{ background: colors[i] }} /><span className="host-donut-name">{h.host}</span><strong>{h.visits}</strong><span className="host-donut-percent">{(h.visits / total * 100).toFixed(1)}%</span></button>)}</div><p className="chart-help">Percentages are shares of the top five total. Select a segment or name to explore that host.</p></> : <div className="reports-empty">No host activity matches these filters.</div>}</article>;
}
