// Shared node shell — all custom nodes wrap this
import React, { useCallback } from 'react';
import { Handle, Position } from 'reactflow';
import { cn } from '../../lib/utils';
import { useFlowStore } from '../../store/flowStore';

export interface NodeBaseProps {
  nodeId: string;           // ReactFlow node id — needed for handle hover tracking
  label: string;
  icon: React.ReactNode;
  color: string;            // Tailwind bg class, e.g. "bg-blue-500"
  selected: boolean;
  children?: React.ReactNode;
  handles?: {
    inputs?: Array<{ id: string; label?: string; position?: number }>;
    outputs?: Array<{ id: string; label: string; position?: number }>;
  };
}

export function NodeBase({ nodeId, label, icon, color, selected, children, handles }: NodeBaseProps) {
  const setHoveredHandle = useFlowStore((s) => s.setHoveredHandle);
  const outputs = handles?.outputs || [{ id: 'next', label: 'next' }];

  // Stable hover callbacks
  const onSourceEnter = useCallback((handleId: string) => () => {
    setHoveredHandle({ nodeId, handleId, handleType: 'source' });
  }, [nodeId, setHoveredHandle]);

  const onTargetEnter = useCallback(() => {
    setHoveredHandle({ nodeId, handleId: null, handleType: 'target' });
  }, [nodeId, setHoveredHandle]);

  const onLeave = useCallback(() => {
    setHoveredHandle(null);
  }, [setHoveredHandle]);

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

      {/* Output handles (right side — violet by default via CSS) */}
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
            onMouseEnter={onSourceEnter(out.id)}
            onMouseLeave={onLeave}
          />
        );
      })}

      {/* Input handle (left side — sky blue by default via CSS) */}
      <Handle
        type="target"
        position={Position.Left}
        onMouseEnter={onTargetEnter}
        onMouseLeave={onLeave}
      />
    </div>
  );
}
