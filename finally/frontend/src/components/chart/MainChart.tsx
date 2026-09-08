"use client";

import { useEffect, useRef } from "react";
import {
  AreaSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { usePriceBuffer, usePriceSnapshot } from "@/hooks/usePrice";

const POSITIVE = "#26a69a";
const NEGATIVE = "#ef5350";
const TEXT_SECONDARY = "#8b93a3";
const BORDER = "#262b36";

export function MainChart({ ticker }: { ticker: string | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const buffer = usePriceBuffer(ticker ?? "");
  const snapshot = usePriceSnapshot(ticker ?? "");
  const isUp = snapshot ? snapshot.direction !== "down" : true;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: TEXT_SECONDARY },
      grid: {
        vertLines: { color: BORDER, style: 1 },
        horzLines: { color: BORDER, style: 1 },
      },
      rightPriceScale: { borderColor: BORDER },
      timeScale: { borderColor: BORDER, timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
    });
    chartRef.current = chart;

    const resizeObserver = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Recreate the series (rather than mutate colors) when direction flips so
  // the gradient fill always matches the current up/down state.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (seriesRef.current) chart.removeSeries(seriesRef.current);
    const series = chart.addSeries(AreaSeries, {
      lineColor: isUp ? POSITIVE : NEGATIVE,
      topColor: isUp ? "rgba(38,166,154,0.28)" : "rgba(239,83,80,0.28)",
      bottomColor: "rgba(0,0,0,0)",
      lineWidth: 2,
      priceLineVisible: true,
      lastValueVisible: true,
    });
    seriesRef.current = series;
    if (buffer.length > 0) {
      series.setData(buffer.map((p) => ({ time: p.time as UTCTimestamp, value: p.price })));
      chart.timeScale().fitContent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUp]);

  useEffect(() => {
    if (!seriesRef.current || buffer.length === 0) return;
    seriesRef.current.setData(buffer.map((p) => ({ time: p.time as UTCTimestamp, value: p.price })));
  }, [buffer]);

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        data-testid="main-chart"
        data-ticker={ticker ?? undefined}
        data-point-count={buffer.length}
        className="h-full w-full"
      />
      {!ticker && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-text-muted">
          Select a ticker from the watchlist to see its chart
        </div>
      )}
    </div>
  );
}
