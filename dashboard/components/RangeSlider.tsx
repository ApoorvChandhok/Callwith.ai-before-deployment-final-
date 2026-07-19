"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";

interface RangeSliderProps {
  data: any[];
  dataKey?: string;
  startIndex: number;
  endIndex: number;
  onChange: (state: { startIndex: number; endIndex: number }) => void;
  height?: number;
  stroke?: string;
  fill?: string;
}

export default function RangeSlider({
  data,
  dataKey = "date",
  startIndex,
  endIndex,
  onChange,
  height = 20,
  stroke = "#8b949e",
  fill = "rgba(139, 148, 158, 0.1)",
}: RangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<"start" | "end" | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartIndex, setDragStartIndex] = useState(0);
  const [localStart, setLocalStart] = useState(startIndex);
  const [localEnd, setLocalEnd] = useState(endIndex);

  useEffect(() => {
    setLocalStart(startIndex);
    setLocalEnd(endIndex);
  }, [startIndex, endIndex]);

  const getIndexFromX = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const x = clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    return Math.round(percent * (data.length - 1));
  }, [data.length]);

  const handleMouseDown = useCallback((e: React.MouseEvent, handle: "start" | "end") => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(handle);
    setDragStartX(e.clientX);
    setDragStartIndex(handle === "start" ? localStart : localEnd);
  }, [localStart, localEnd]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const track = trackRef.current;
      if (!track) return;

      const rect = track.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = Math.max(0, Math.min(1, x / rect.width));
      const newIndex = Math.round(percent * (data.length - 1));

      if (isDragging === "start") {
        const newStart = Math.min(newIndex, localEnd - 1);
        setLocalStart(Math.max(0, newStart));
      } else {
        const newEnd = Math.max(newIndex, localStart + 1);
        setLocalEnd(Math.min(data.length - 1, newEnd));
      }
    };

    const handleMouseUp = () => {
      setIsDragging(null);
      onChange({ startIndex: localStart, endIndex: localEnd });
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, localStart, localEnd, data.length, onChange]);

  // Touch support
  const handleTouchStart = useCallback((e: React.TouchEvent, handle: "start" | "end") => {
    e.stopPropagation();
    setIsDragging(handle);
    setDragStartX(e.touches[0].clientX);
    setDragStartIndex(handle === "start" ? localStart : localEnd);
  }, [localStart, localEnd]);

  useEffect(() => {
    if (!isDragging) return;

    const handleTouchMove = (e: TouchEvent) => {
      const track = trackRef.current;
      if (!track) return;

      const rect = track.getBoundingClientRect();
      const x = e.touches[0].clientX - rect.left;
      const percent = Math.max(0, Math.min(1, x / rect.width));
      const newIndex = Math.round(percent * (data.length - 1));

      if (isDragging === "start") {
        const newStart = Math.min(newIndex, localEnd - 1);
        setLocalStart(Math.max(0, newStart));
      } else {
        const newEnd = Math.max(newIndex, localStart + 1);
        setLocalEnd(Math.min(data.length - 1, newEnd));
      }
    };

    const handleTouchEnd = () => {
      setIsDragging(null);
      onChange({ startIndex: localStart, endIndex: localEnd });
    };

    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);

    return () => {
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isDragging, localStart, localEnd, data.length, onChange]);

  const startPercent = (localStart / (data.length - 1)) * 100;
  const endPercent = (localEnd / (data.length - 1)) * 100;

  const formatDate = (idx: number) => {
    const item = data[idx];
    if (!item) return "";
    const dateStr = item[dataKey] || "";
    return dateStr.split(" ")[0] || "";
  };

  return (
    <div className="w-full select-none" style={{ height: height + 20 }}>
      {/* Track */}
      <div
        ref={trackRef}
        className="relative w-full cursor-pointer"
        style={{ height: height, marginTop: 10 }}
      >
        {/* Background */}
        <div
          className="absolute inset-0 rounded"
          style={{ backgroundColor: fill }}
        />

        {/* Selected range */}
        <div
          className="absolute top-0 bottom-0 rounded"
          style={{
            left: `${startPercent}%`,
            width: `${endPercent - startPercent}%`,
            backgroundColor: "rgba(99, 102, 241, 0.3)",
            border: `1px solid ${stroke}`,
          }}
        />

        {/* Start handle */}
        <div
          className="absolute top-0 bottom-0 cursor-grab active:cursor-grabbing z-10"
          style={{
            left: `calc(${startPercent}% - 6px)`,
            width: 12,
          }}
          onMouseDown={(e) => handleMouseDown(e, "start")}
          onTouchStart={(e) => handleTouchStart(e, "start")}
        >
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-8 rounded-full border-2 transition-colors"
            style={{
              backgroundColor: isDragging === "start" ? "#6366f1" : "#e5e7eb",
              borderColor: isDragging === "start" ? "#6366f1" : stroke,
            }}
          />
        </div>

        {/* End handle */}
        <div
          className="absolute top-0 bottom-0 cursor-grab active:cursor-grabbing z-10"
          style={{
            left: `calc(${endPercent}% - 6px)`,
            width: 12,
          }}
          onMouseDown={(e) => handleMouseDown(e, "end")}
          onTouchStart={(e) => handleTouchStart(e, "end")}
        >
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-8 rounded-full border-2 transition-colors"
            style={{
              backgroundColor: isDragging === "end" ? "#6366f1" : "#e5e7eb",
              borderColor: isDragging === "end" ? "#6366f1" : stroke,
            }}
          />
        </div>
      </div>

      {/* Labels */}
      <div className="flex justify-between mt-1 text-[10px] text-gray-500 dark:text-gray-400 font-medium">
        <span>{formatDate(localStart)}</span>
        <span>{formatDate(localEnd)}</span>
      </div>
    </div>
  );
}
