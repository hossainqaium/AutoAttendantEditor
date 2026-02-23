// =============================================================================
// IVR Studio: Templates Modal
// Browse & load pre-built IVR flow templates onto the canvas
// =============================================================================

import React, { useState } from 'react';
import {
  X, Layout, Clock, Headphones, Info, Zap, ChevronRight, Check,
  Building2, Hotel, Utensils, Landmark, ShieldAlert, Lock,
  PackageSearch, Network, GitFork, HeartPulse, Wifi,
  Scale, Shield, ShoppingCart, Users, Layers, CalendarCheck,
  Globe,
} from 'lucide-react';
import { type IvrTemplate } from '../api/client';
import { TEMPLATES } from '../data/templates';
import { cn } from '../lib/utils';

interface Props {
  onClose: () => void;
  onLoad: (template: IvrTemplate) => void;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  // general
  menu:           <Layout       size={22} />,
  clock:          <Clock        size={22} />,
  headset:        <Headphones   size={22} />,
  info:           <Info         size={22} />,
  api:            <Zap          size={22} />,
  // business
  medical:        <HeartPulse   size={22} />,
  restaurant:     <Utensils     size={22} />,
  hotel:          <Hotel        size={22} />,
  building:       <Building2    size={22} />,
  bank:           <Landmark     size={22} />,
  emergency:      <ShieldAlert  size={22} />,
  legal:          <Scale        size={22} />,
  shield:         <Shield       size={22} />,
  ecommerce:      <ShoppingCart size={22} />,
  // api-driven
  lock:           <Lock         size={22} />,
  order:          <PackageSearch size={22} />,
  routing:        <Network      size={22} />,
  crm:            <Users        size={22} />,
  layers:         <Layers       size={22} />,
  calendar:       <CalendarCheck size={22} />,
  // multi-level
  tree:           <GitFork      size={22} />,
  'medical-tree': <HeartPulse   size={22} />,
  telecom:        <Wifi         size={22} />,
  globe:          <Globe        size={22} />,
  sitemap:        <Network      size={22} />,
};

const CATEGORY_COLORS: Record<string, string> = {
  General:      'bg-indigo-50 text-indigo-700  border-indigo-200',
  Routing:      'bg-amber-50  text-amber-700   border-amber-200',
  Informational:'bg-teal-50   text-teal-700    border-teal-200',
  Advanced:     'bg-purple-50 text-purple-700  border-purple-200',
  Business:     'bg-blue-50   text-blue-700    border-blue-200',
  'API-Driven': 'bg-orange-50 text-orange-700  border-orange-200',
  'Multi-Level':'bg-rose-50   text-rose-700    border-rose-200',
};

export function TemplatesModal({ onClose, onLoad }: Props) {
  const [selected, setSelected] = useState<IvrTemplate | null>(null);
  const [filter, setFilter] = useState<string>('All');

  const categories = ['All', ...Array.from(new Set(TEMPLATES.map((t) => t.category)))];
  const visible = filter === 'All' ? TEMPLATES : TEMPLATES.filter((t) => t.category === filter);

  const nodeCount = (t: IvrTemplate) => t.graph.nodes.length;
  const edgeCount = (t: IvrTemplate) => t.graph.edges.length;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">IVR Templates</h2>
            <p className="text-xs text-gray-400 mt-0.5">Start from a pre-built flow — you can customise everything after loading</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        {/* Category filter */}
        <div className="flex gap-2 px-6 py-3 border-b border-gray-50 overflow-x-auto shrink-0">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                filter === cat
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Template grid */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {visible.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelected(selected?.id === t.id ? null : t)}
                className={cn(
                  'text-left rounded-xl border-2 p-4 transition-all hover:shadow-md group',
                  selected?.id === t.id
                    ? 'border-indigo-500 bg-indigo-50/50 shadow-md'
                    : 'border-gray-200 hover:border-indigo-300 bg-white'
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className={cn(
                    'flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center',
                    selected?.id === t.id ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500 group-hover:bg-indigo-100 group-hover:text-indigo-600'
                  )}>
                    {ICON_MAP[t.icon] || <Layout size={22} />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-gray-900">{t.name}</span>
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', CATEGORY_COLORS[t.category] || 'bg-gray-100 text-gray-600')}>
                        {t.category}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">{t.description}</p>
                    <div className="flex gap-3 mt-2 text-[10px] text-gray-400">
                      <span>{nodeCount(t)} nodes</span>
                      <span>{edgeCount(t)} connections</span>
                    </div>
                  </div>

                  {selected?.id === t.id && (
                    <div className="shrink-0 w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center">
                      <Check size={11} className="text-white" />
                    </div>
                  )}
                </div>

                {/* Node preview chips */}
                {selected?.id === t.id && (
                  <div className="mt-3 pt-3 border-t border-indigo-200 flex flex-wrap gap-1">
                    {t.graph.nodes.map((n) => (
                      <span key={n.id} className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-mono">
                        {(n.data?.label as string) || n.type}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
          <p className="text-xs text-gray-400">
            {selected
              ? `"${selected.name}" selected — ${nodeCount(selected)} nodes, ${edgeCount(selected)} connections`
              : 'Select a template to preview and load it'}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-800 rounded-lg border border-gray-200 hover:bg-gray-100">
              Cancel
            </button>
            <button
              disabled={!selected}
              onClick={() => selected && onLoad(selected)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg font-medium transition-colors',
                selected
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              )}
            >
              Load Template <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
