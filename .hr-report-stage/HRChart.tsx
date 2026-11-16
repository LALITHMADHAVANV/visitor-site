'use client';
import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import type { EChartsCoreOption } from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, DataZoomComponent, AriaComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, DataZoomComponent, AriaComponent, SVGRenderer]);

export default function HRChart({ option, onSelect, label }: { option: EChartsCoreOption; onSelect?: (name: string) => void; label: string }) {
  const element = useRef<HTMLDivElement>(null);
  const instance = useRef<ReturnType<typeof echarts.init> | null>(null);
  const select = useRef(onSelect);
  const [error, setError] = useState('');
  useEffect(() => { select.current = onSelect; }, [onSelect]);
  useEffect(() => {
    if (!element.current) return;
    const chart = echarts.init(element.current, undefined, { renderer: 'svg' });
    instance.current = chart;
    chart.on('click', event => { if (event.componentType === 'series') select.current?.(event.name); });
    const observer = new ResizeObserver(() => { if (!chart.isDisposed()) chart.resize(); });
    observer.observe(element.current);
    return () => { observer.disconnect(); chart.dispose(); instance.current = null; };
  }, []);
  useEffect(() => {
    try {
      instance.current?.setOption({ aria: { enabled: true }, textStyle: { fontFamily: 'inherit' }, ...option }, { notMerge: true });
      setError('');
    } catch { setError('Chart unavailable. The records are available in the table below.'); }
  }, [option]);
  return <div role="group" aria-label={label} className="min-w-0">{error && <p role="alert" className="text-red-700">{error}</p>}<div ref={element} className="h-[260px] w-full" /></div>;
}
