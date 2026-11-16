import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, ToolboxComponent, AriaComponent, TitleComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, ToolboxComponent, AriaComponent, TitleComponent, SVGRenderer]);
export default function ReportChart({ option, onClick, onReset, label, height = 280 }) {
    const container = useRef(null);
    const instance = useRef(null);
    const click = useRef(onClick);
    const reset = useRef(onReset);
    const [error, setError] = useState('');
    useEffect(() => { click.current = onClick; }, [onClick]);
    useEffect(() => { reset.current = onReset; }, [onReset]);
    useEffect(() => {
        let observer;
        let chart;
        try {
            chart = echarts.init(container.current, null, { renderer: 'svg' });
            instance.current = chart;
            chart.on('click', event => click.current?.(event));
            chart.on('restore', () => reset.current?.());
            observer = new ResizeObserver(() => { if (!chart.isDisposed()) chart.resize(); });
            observer.observe(container.current);
        } catch (e) { setError('Unable to display this chart. The report data is still available below.'); console.error('Chart initialization failed', e); }
        return () => { observer?.disconnect(); chart?.dispose(); instance.current = null; };
    }, []);
    useEffect(() => {
        if (!instance.current) return;
        try {
            instance.current.setOption({ animationDuration: 450, color: ['#2563eb', '#0891b2', '#7c3aed', '#f59e0b', '#059669'], textStyle: { fontFamily: 'Inter, Segoe UI, sans-serif', fontSize: 11 }, aria: { enabled: true }, ...option }, { notMerge: true });
            setError('');
        } catch (e) { setError('Unable to display this chart. The report data is still available below.'); console.error('Chart update failed', e); }
    }, [option]);
    return <div role="group" aria-label={label}>{error && <p role="alert" className="reports-error">{error}</p>}<div ref={container} style={{ height, width: '100%' }} /></div>;
}
