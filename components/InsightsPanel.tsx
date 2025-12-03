import React, { useState, useEffect } from 'react';
import { generateStrategicInsights } from '../services/geminiService';
import { KPIStats, FilterState, TopItem } from '../types';

interface InsightsPanelProps {
  kpis: KPIStats; // Current Month (Nov)
  avgKpis: KPIStats; // Average (Aug-Oct)
  filters: FilterState;
  topClients: TopItem[];
  topProducts: TopItem[];
  topReps: TopItem[];
}

export const InsightsPanel: React.FC<InsightsPanelProps> = ({ kpis, avgKpis, filters, topClients, topProducts, topReps }) => {
  const [insight, setInsight] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const fetchInsights = async () => {
    setLoading(true);
    // Pass both Current and Average KPIs to the AI for comparison
    const result = await generateStrategicInsights(kpis, avgKpis, filters, topClients, topProducts, topReps);
    setInsight(result);
    setLoading(false);
  };

  // Initial fetch on mount or filter change
  useEffect(() => {
    // Check if filters are populated (arrays are not empty)
    if (filters.region.length > 0 || filters.division.length > 0) {
        fetchInsights();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]); 

  return (
    <div className="bg-card/50 backdrop-blur-md rounded-xl border border-primary/20 p-6 shadow-2xl h-full flex flex-col relative overflow-hidden">
      
      <div className="flex items-center justify-between mb-6 flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl border border-primary/20">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-main tracking-tight">AI Sales Consultant</h2>
              <p className="text-[10px] text-text-dim font-mono uppercase">Gemini 2.5 Analysis</p>
            </div>
        </div>
        <button 
            onClick={fetchInsights}
            disabled={loading}
            className="px-3 py-1.5 bg-primary/10 border border-primary/30 text-[10px] font-bold text-primary hover:bg-primary hover:text-background rounded-md transition-all shadow-lg disabled:opacity-50 uppercase tracking-widest"
        >
            {loading ? 'Processando...' : 'Gerar Insights'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar z-10">
        {loading ? (
          <div className="space-y-4 animate-pulse pt-2">
            <div className="h-2 bg-white/10 rounded w-3/4"></div>
            <div className="h-2 bg-white/5 rounded w-full"></div>
            <div className="h-2 bg-white/5 rounded w-5/6"></div>
            <div className="h-24 bg-white/5 rounded-lg w-full mt-4 border border-dashed border-white/10"></div>
            <div className="space-y-2 mt-4">
               <div className="h-2 bg-white/5 rounded w-full"></div>
               <div className="h-2 bg-white/5 rounded w-full"></div>
            </div>
          </div>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none text-text-dim leading-relaxed text-xs">
            <div dangerouslySetInnerHTML={{ 
                __html: insight
                  .replace(/### (.*?)\n/g, '<h3 class="text-sm font-bold text-primary mt-6 mb-3 border-b border-primary/30 pb-1 uppercase tracking-wider glow-text">$1</h3>')
                  .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-bold">$1</strong>')
                  .replace(/^\* /gm, '<div class="flex items-start gap-2 mb-2"><span class="text-primary mt-1 text-[8px]">●</span><span>')
                  .replace(/\n\* /g, '</span></div><div class="flex items-start gap-2 mb-2"><span class="text-primary mt-1 text-[8px]">●</span><span>')
                  .replace(/\n/g, '<br />')
              }} 
            />
          </div>
        )}
      </div>
      
      {!loading && (
        <div className="mt-4 pt-4 border-t border-white/5 text-[9px] uppercase tracking-widest text-text-dim font-bold flex justify-between z-10">
          <span>{(filters.region.includes('all') || filters.region.length === 0) ? 'Nacional' : filters.region.join(', ')}</span>
          <span className="font-mono text-primary">{new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span>
        </div>
      )}
    </div>
  );
};