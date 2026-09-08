"use client";

import { useEffect, useRef } from "react";
import { AreaSeries, ColorType, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { usePriceBuffer } from "@/hooks/usePrice";

const POSITIVE = "#26a69a";
const NEGATIVE = "#ef5350";

export function Sparkline({ ticker, positive }: { ticker: string; positive: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const buffer = usePriceBuffer(ticker);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 32,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "transparent" },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { visible: false },
      timeScale: { visible: false },
      crosshair: { horzLine: { visible: false }, vertLine: { visible: false } },
      handleScroll: false,
      handleScale: false,
    });
    const series = chart.addSeries(AreaSeries, {
      lineColor: positive ? POSITIVE : NEGATIVE,
      topColor: positive ? "rgba(38,166,154,0.25)" : "rgba(239,83,80,0.25)",
      bottomColor: "rgba(0,0,0,0)",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const resizeObserver = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
    // Line color depends on `positive`, which only flips when the day's net
    // direction changes — cheap enough to fully rebuild the tiny chart.
  }, [positive]);

  useEffect(() => {
    if (!seriesRef.current || buffer.length === 0) return;
    seriesRef.current.setData(buffer.map((p) => ({ time: p.time as UTCTimestamp, value: p.price })));
  }, [buffer]);

  return (
    <div
      ref={containerRef}
      data-testid="sparkline"
      data-ticker={ticker}
      data-point-count={buffer.length}
      className="h-8 w-24 shrink-0"
    />
  );
}
