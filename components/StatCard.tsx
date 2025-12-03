import React from 'react';

interface StatCardProps {
  title: string;
  value: string;
  trend?: number;
  icon?: React.ReactNode;
  trendLabel?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, trend, icon, trendLabel = "vs. período anterior" }) => {
  const isPositive = trend && trend >= 0;

  return (
    <div className="bg-card rounded-xl p-6 border border-white/5 relative overflow-hidden group hover:border-primary/30 transition-all duration-300">
      {/* Glow Effect */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-primary/10 transition-all"></div>

      <div className="flex items-center justify-between mb-4 relative z-10">
        <h3 className="text-xs font-bold text-text-dim uppercase tracking-wider">{title}</h3>
        {icon && <div className="text-primary opacity-80">{icon}</div>}
      </div>
      <div className="relative z-10">
        <div className="text-2xl font-bold text-text-main tracking-tight font-mono">{value}</div>
        {trend !== undefined && (
          <div className={`flex items-center mt-2 text-sm ${isPositive ? 'text-success' : 'text-danger'}`}>
            <span className="font-bold">{isPositive ? '+' : ''}{trend.toFixed(1)}%</span>
            <span className="ml-2 text-text-dim text-xs font-medium opacity-60">{trendLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
};