// Shared node shell — all custom nodes wrap this
import React from 'react';
import { Handle, Position } from 'reactflow';
import { cn } from '../../lib/utils';

export interface NodeBaseProps {
  label: string;
  icon: React.ReactNode;
  color: string;        // Tailwind bg class, e.g. "bg-blue-500"
  selected: boolean;
  children?: React.ReactNode;
  handles?: {
    inputs?: Array<{ id: string; label?: string; position?: number }>;
    outputs?: Array<{ id: string; label: string; position?: number }>;
  };
}

export function NodeBase({ label, icon, color, selected, children, handles }: NodeBaseProps) {
  const outputs = handles?.outputs || [{ id: 'next', label: 'next' }];

  return (
    <div
      className={cn(
        'rounded-xl shadow-md border-2 min-w-[160px] max-w-[220px] bg-white',
        selected ? 'border-indigo-500 shadow-indigo-200 shadow-lg' : 'border-gray-200'
      )}
    >
      {/* Header */}
      <div className={cn('flex items-center gap-2 px-3 py-2 rounded-t-xl text-white', color)}>
        <span className="text-sm">{icon}</span>
        <span className="text-xs font-semibold truncate">{label}</span>
      </div>

      {/* Content */}
      {children && (
        <div className="px-3 py-2 text-xs text-gray-600 space-y-1">{children}</div>
      )}

      {/* Output handles — colours driven by CSS (.react-flow__handle-source / -connected) */}
      {outputs.map((out, idx) => {
        const top = outputs.length === 1
          ? '50%'
          : `${10 + (idx * 80) / (outputs.length - 1)}%`;
        return (
          <Handle
            key={out.id}
            type="source"
            position={Position.Right}
            id={out.id}
            style={{ top }}
            title={out.label}
          />
        );
      })}

      {/* Single input handle — colour driven by CSS (.react-flow__handle-target / -connected) */}
      <Handle
        type="target"
        position={Position.Left}
      />
    </div>
  );
}
