"use client";

import React from "react";
import { getBezierPath, type EdgeProps } from "@xyflow/react";

const PORT_COLORS: Record<string, string> = {
  default: "#4b5563",
  yes: "#3fb950",
  no: "#f85149",
  loop: "#a855f7",
  done: "#9ca3af",
  fallback: "#f85149",
};

function getEdgeColor(sourcePort?: string): string {
  if (!sourcePort) return PORT_COLORS.default;
  if (sourcePort.startsWith("output_")) return "#d29922";
  return PORT_COLORS[sourcePort] || PORT_COLORS.default;
}

function getEdgeLabel(sourcePort?: string, data?: any): string | undefined {
  if (data?.label) return data.label;
  if (!sourcePort) return undefined;
  if (sourcePort === "yes") return "Yes";
  if (sourcePort === "no") return "No";
  if (sourcePort === "loop") return "Loop";
  if (sourcePort === "done") return "Done";
  if (sourcePort === "fallback") return "Fallback";
  if (sourcePort.startsWith("output_")) return `Out ${sourcePort.replace("output_", "")}`;
  return undefined;
}

export default function WorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style = {},
  markerEnd,
  selected,
}: EdgeProps) {
  const sourcePort = (data as any)?.sourcePort;
  const strokeColor = getEdgeColor(sourcePort);
  const label = getEdgeLabel(sourcePort, data);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      {/* Invisible wider path for easier click */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        className="react-flow__edge-interaction"
      />
      {/* Visible edge */}
      <path
        d={edgePath}
        fill="none"
        stroke={selected ? "#818cf8" : strokeColor}
        strokeWidth={selected ? 3 : 2}
        className="react-flow__edge-path"
        style={{ opacity: selected ? 1 : 0.6 }}
      />
      {/* Animated dot */}
      <circle r="3" fill={strokeColor} opacity={0.8}>
        <animateMotion dur="3s" repeatCount="indefinite" path={edgePath} />
      </circle>
      {/* Arrow */}
      <marker
        id={`arrow-${id}`}
        viewBox="0 0 10 10"
        refX="5"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill={strokeColor} opacity={0.6} />
      </marker>
      {/* Label pill */}
      {label && (
        <g>
          <rect
            x={labelX - 18}
            y={labelY - 10}
            width={36}
            height={20}
            rx={10}
            fill="#0d1117"
            stroke={strokeColor}
            strokeWidth={1}
            opacity={0.9}
          />
          <text
            x={labelX}
            y={labelY + 4}
            textAnchor="middle"
            className="text-[9px] font-medium"
            style={{ fill: strokeColor }}
          >
            {label}
          </text>
        </g>
      )}
    </>
  );
}
