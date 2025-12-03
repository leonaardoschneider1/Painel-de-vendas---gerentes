import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  filterData, calculateKPIs, getCascadingOptions,
  getSectorPivotData,
  getNetworkStats, getClientStats, getProductStats, getSupplierStats, getRepStats, getGeoStats,
  parseCSV, fetchGoogleSheetsData
} from './services/dataService';
import { FilterState, SaleRecord, KPIStats, EntityStats, ProductStats, TopItem } from './types';
import { StatCard } from './components/StatCard';
import { InsightsPanel } from './components/InsightsPanel';
import SalesHeatmap from './components/SalesHeatmap';

// --- ICONS ---
const FilterIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>;
const SearchIcon = () => <svg className="w-5 h-5 text-text-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
const UploadIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>;
const ChevronDown = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>;
const DownloadIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>;

// --- CUSTOM COMPONENTS ---

const TrendIndicator = ({ value, inverse = false }: { value: number, inverse?: boolean }) => {
    if (value === 0) return <span className="text-text-dim">-</span>;
    let isGood = value > 0;
    if (inverse) isGood = !isGood; 

    const colorClass = isGood ? 'text-success' : 'text-danger';
    const arrow = value > 0 ? '▲' : '▼';
    
    return (
        <span className={`text-[10px] ${colorClass} font-bold flex items-center justify-end gap-1`}>
            {arrow} {Math.abs(value).toFixed(1)}%
        </span>
    );
};

interface MultiSelectProps {
    label: string;
    options: string[];
    selected: string[];
    onChange: (selected: string[]) => void;
    disabled?: boolean;
}

const MultiSelectDropdown: React.FC<MultiSelectProps> = ({ label, options, selected, onChange, disabled }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOption = (option: string) => {
        if (selected.includes(option)) {
            onChange(selected.filter(item => item !== option));
        } else {
            onChange([...selected, option]);
        }
    };

    const toggleAll = () => {
        if (selected.length === options.length) {
            onChange([]);
        } else {
            onChange(options);
        }
    };

    const displayText = selected.length === 0 
        ? 'Selecione...' 
        : selected.length === options.length 
            ? 'Todos selecionados' 
            : selected.length === 1 
                ? selected[0] 
                : `${selected.length} selecionados`;

    return (
        <div className="relative" ref={dropdownRef}>
            <label className="block text-xs font-bold text-primary uppercase tracking-wider mb-2">
                {label}
            </label>
            <button
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`w-full bg-background border border-border text-left rounded-lg px-4 py-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors flex justify-between items-center ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary/50'}`}
            >
                <span className={`text-sm truncate block mr-4 ${selected.length === 0 ? 'text-text-dim' : 'text-text-main'}`}>
                    {displayText}
                </span>
                <ChevronDown />
            </button>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-card border border-white/10 rounded-lg shadow-xl max-h-60 overflow-y-auto custom-scrollbar">
                    <div className="p-2 border-b border-white/5 sticky top-0 bg-card z-10">
                         <button 
                            onClick={toggleAll}
                            className="w-full text-left px-2 py-1.5 text-xs font-bold text-primary hover:bg-white/5 rounded transition-colors"
                         >
                            {selected.length === options.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                         </button>
                    </div>
                    <div className="p-2 space-y-1">
                        {options.map(option => (
                            <div 
                                key={option} 
                                onClick={() => toggleOption(option)}
                                className="flex items-center gap-3 px-2 py-2 hover:bg-white/5 rounded cursor-pointer group transition-colors"
                            >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selected.includes(option) ? 'bg-primary border-primary' : 'border-text-dim group-hover:border-primary'}`}>
                                    {selected.includes(option) && <svg className="w-3 h-3 text-background font-bold" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                </div>
                                <span className={`text-sm ${selected.includes(option) ? 'text-white font-medium' : 'text-text-dim'}`}>{option}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// --- MAIN APP COMPONENT ---

function App() {
  const [allData, setAllData] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  const [isSetupComplete, setIsSetupComplete] = useState<boolean>(false);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([]);

  const [filters, setFilters] = useState<FilterState>({
    division: [],
    region: [],
    sector: [],
    salesRep: [],
    channel: [],
    supplier: [],
    startMonth: '2025-08',
    endMonth: '2025-11'
  });

  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'clients' | 'products' | 'suppliers' | 'redes'>('clients');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 30;

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      const data = await fetchGoogleSheetsData();
      if (data.length > 0) {
        setAllData(data);
      }
      setLoading(false);
    };
    initData();
  }, []);

  const availableChannels = useMemo(() => Array.from(new Set(allData.map(r => r.channel).filter(Boolean))).sort(), [allData]);
  
  const availableRegions = useMemo(() => {
      let data = allData;
      if (selectedChannels.length > 0) data = data.filter(r => selectedChannels.includes(r.channel));
      return Array.from(new Set(data.map(r => r.region).filter(Boolean))).sort();
  }, [allData, selectedChannels]);

  const availableDivisions = useMemo(() => {
      let data = allData;
      if (selectedChannels.length > 0) data = data.filter(r => selectedChannels.includes(r.channel));
      if (selectedRegions.length > 0) data = data.filter(r => selectedRegions.includes(r.region));
      else return [];
      return Array.from(new Set(data.map(r => r.division).filter(Boolean))).sort();
  }, [allData, selectedRegions, selectedChannels]);

  // --- KPI LOGIC ---
  const currentMonthData = useMemo(() => {
      const novFilter = { ...filters, startMonth: '2025-11', endMonth: '2025-11' };
      return filterData(allData, novFilter);
  }, [allData, filters]);

  const currentMonthKPIs = useMemo(() => calculateKPIs(currentMonthData), [currentMonthData]);

  const avgHistoryKPIs = useMemo(() => {
      const statsByMonth: KPIStats[] = [];
      ['2025-08', '2025-09', '2025-10'].forEach(month => {
          const monthFilter = { ...filters, startMonth: month, endMonth: month };
          const d = filterData(allData, monthFilter);
          statsByMonth.push(calculateKPIs(d));
      });
      const avg: any = {};
      const keys = Object.keys(statsByMonth[0] || {}) as (keyof KPIStats)[];
      keys.forEach(k => {
          const sum = statsByMonth.reduce((acc, curr) => acc + curr[k], 0);
          avg[k] = sum / 3;
      });
      return avg as KPIStats;
  }, [allData, filters]);

  const fullPeriodData = useMemo(() => filterData(allData, filters), [allData, filters]);
  
  const pivotData = useMemo(() => getSectorPivotData(fullPeriodData), [fullPeriodData]);
  const filterOptions = useMemo(() => getCascadingOptions(allData, filters), [allData, filters]);

  // Geo Data
  const geoStats = useMemo(() => getGeoStats(fullPeriodData), [fullPeriodData]);

  // Rep Stats for AI
  const repStats = useMemo(() => getRepStats(fullPeriodData), [fullPeriodData]);
  const topReps = useMemo(() => repStats.slice(0, 10).map(r => ({ id: r.id, name: r.name, value: r.revenue, subValue: r.orders })), [repStats]);

  const calcTrend = (current: number, avg: number) => {
      if (avg === 0) return current > 0 ? 100 : 0;
      return ((current - avg) / avg) * 100;
  };

  const trends = useMemo(() => ({
      revenue: calcTrend(currentMonthKPIs.totalRevenue, avgHistoryKPIs.totalRevenue),
      positivacao: calcTrend(currentMonthKPIs.positivacao, avgHistoryKPIs.positivacao),
      ticket: calcTrend(currentMonthKPIs.averageTicket, avgHistoryKPIs.averageTicket),
      sku: calcTrend(currentMonthKPIs.skuPerPdv, avgHistoryKPIs.skuPerPdv)
  }), [currentMonthKPIs, avgHistoryKPIs]);


  const clientStats = useMemo(() => {
      const stats = getClientStats(fullPeriodData); 
      if (!searchTerm) return stats;
      return stats.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.id.includes(searchTerm));
  }, [fullPeriodData, searchTerm]);

  const productStats = useMemo(() => {
      const stats = getProductStats(fullPeriodData);
      if (!searchTerm) return stats;
      return stats.filter(p => p.desc.toLowerCase().includes(searchTerm.toLowerCase()) || p.code.includes(searchTerm));
  }, [fullPeriodData, searchTerm]);

  const supplierStats = useMemo(() => {
      const stats = getSupplierStats(fullPeriodData);
      if (!searchTerm) return stats;
      return stats.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [fullPeriodData, searchTerm]);

  const networksStats = useMemo(() => {
      const stats = getNetworkStats(fullPeriodData);
      if (!searchTerm) return stats;
      return stats.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [fullPeriodData, searchTerm]);

  // Reset page when tab/search changes
  useEffect(() => {
      setCurrentPage(1);
  }, [activeTab, searchTerm, filters]);

  const getCurrentTableData = () => {
      switch(activeTab) {
          case 'clients': return clientStats;
          case 'products': return productStats;
          case 'suppliers': return supplierStats;
          case 'redes': return networksStats;
          default: return [];
      }
  };

  const currentData = getCurrentTableData();
  const totalPages = Math.ceil(currentData.length / ITEMS_PER_PAGE);
  const paginatedData = currentData.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const handleExportCSV = () => {
      const data = getCurrentTableData();
      if (data.length === 0) return;
      
      const headers = Object.keys(data[0]).join(',');
      const rows = data.map(row => Object.values(row).map(val => `"${val}"`).join(',')).join('\n');
      const csvContent = `data:text/csv;charset=utf-8,${headers}\n${rows}`;
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `export_${activeTab}_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleSetupComplete = () => {
      if (selectedChannels.length === 0 || selectedRegions.length === 0 || selectedDivisions.length === 0) {
          alert("Por favor, selecione pelo menos uma opção em Canal, Região e Divisão.");
          return;
      }
      setFilters(prev => ({
          ...prev,
          channel: selectedChannels,
          region: selectedRegions,
          division: selectedDivisions
      }));
      setIsSetupComplete(true);
  };

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value === 'all' ? [] : [value] }));
  };

  const clearFilters = () => {
    setFilters(prev => ({ ...prev, sector: [], salesRep: [], supplier: [] }));
  };

  const handleUploadClick = () => fileInputRef.current?.click();
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        const newData = parseCSV(text);
        setAllData(newData);
        setIsSetupComplete(false);
        setSelectedChannels([]);
        setSelectedRegions([]);
        setSelectedDivisions([]);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (!isSetupComplete) {
      return (
          <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".csv" className="hidden" />
              <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full"></div>
              <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/10 blur-[120px] rounded-full"></div>
              <div className="bg-card border border-white/5 p-8 sm:p-12 rounded-2xl shadow-2xl max-w-lg w-full z-10 backdrop-blur-sm">
                  <div className="text-center mb-10">
                      <div className="mb-6 flex justify-center">
                          <img src="https://i.postimg.cc/xcbthdSs/Logo-DP4-branca.png" alt="Logo Empresa" className="h-24 object-contain" />
                      </div>
                      <h1 className="text-2xl font-bold text-text-main mb-2">Bem-vindo assistente de vendas criado com Inteligência Artificial</h1>
                      <p className="text-text-dim text-sm">Configure sua visualização para acessar o painel executivo.</p>
                  </div>
                  {loading ? (
                       <div className="flex flex-col items-center py-8">
                           <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                           <p className="text-text-dim text-xs animate-pulse">Sincronizando dados...</p>
                       </div>
                  ) : (
                      <div className="space-y-6">
                          <MultiSelectDropdown label="Selecione os Canais" options={availableChannels} selected={selectedChannels} onChange={(newSelected) => { setSelectedChannels(newSelected); setSelectedRegions([]); setSelectedDivisions([]); }} />
                          <MultiSelectDropdown label="Selecione as Regiões" options={availableRegions} selected={selectedRegions} onChange={(newSelected) => { setSelectedRegions(newSelected); setSelectedDivisions([]); }} disabled={selectedChannels.length === 0} />
                          <MultiSelectDropdown label="Selecione as Divisões" options={availableDivisions} selected={selectedDivisions} onChange={setSelectedDivisions} disabled={selectedRegions.length === 0} />
                          <button onClick={handleSetupComplete} disabled={selectedChannels.length === 0 || selectedRegions.length === 0 || selectedDivisions.length === 0} className="w-full bg-primary text-background font-bold py-4 rounded-lg mt-4 hover:bg-primary/90 transition-all shadow-[0_0_20px_rgba(226,246,78,0.2)] disabled:opacity-50 disabled:shadow-none uppercase tracking-wide">Acessar Dashboard</button>
                          <div className="text-center mt-6"><button onClick={handleUploadClick} className="text-[10px] text-text-dim hover:text-white underline">Carregar arquivo CSV manual</button></div>
                      </div>
                  )}
              </div>
          </div>
      );
  }

  // Formatters
  const fmtCurrency2 = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtCurrency1 = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
  const fmtNumber1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmtInt = (v: number) => Math.round(v).toLocaleString('pt-BR');

  return (
    <div className="min-h-screen bg-background text-text-main font-sans selection:bg-primary selection:text-background">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".csv" className="hidden" />
      <header className="bg-card/80 backdrop-blur-md border-b border-white/5 sticky top-0 z-30">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
            <div className="flex items-center gap-4">
                <img src="https://i.postimg.cc/xcbthdSs/Logo-DP4-branca.png" alt="Logo" className="h-10 w-auto object-contain" />
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-white">Dashboard de Vendas</h1>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 mt-1">
                      <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-success"></span><span className="text-[10px] text-text-dim uppercase tracking-wider font-semibold">Canal: <span className="text-white">{filters.channel.join(', ')}</span></span></div>
                      <div className="hidden sm:block w-px h-3 bg-white/10"></div>
                      <div className="flex items-center gap-1.5"><span className="text-[10px] text-text-dim uppercase tracking-wider font-semibold">Região: <span className="text-white">{filters.region.length > 3 ? `${filters.region.length} selecionadas` : filters.region.join(', ')}</span></span></div>
                      <div className="hidden sm:block w-px h-3 bg-white/10"></div>
                      <div className="flex items-center gap-1.5"><span className="text-[10px] text-text-dim uppercase tracking-wider font-semibold text-primary">Novembro 2025</span></div>
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-4">
                <button onClick={() => setIsSetupComplete(false)} className="text-xs text-text-dim hover:text-white transition-colors mr-2 uppercase tracking-wider font-semibold">Alterar Filtros</button>
                <button onClick={handleUploadClick} className="hidden md:flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-md text-xs font-bold transition-all uppercase tracking-wide"><UploadIcon /> CSV</button>
            </div>
        </div>
      </header>

      <main className="max-w-[1920px] mx-auto px-4 sm:px-6 py-8">
        <div className="bg-card rounded-xl border border-white/5 mb-8 overflow-hidden">
            <div className="px-6 py-4 bg-card border-b border-white/5 flex items-center justify-between cursor-pointer select-none hover:bg-white/5 transition-colors" onClick={() => setIsFiltersOpen(!isFiltersOpen)}>
                <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-widest"><FilterIcon /><span>Filtros Adicionais (Setor, Rep, Fornecedor)</span></div>
                <div className="flex items-center gap-2">
                    {(filters.sector.length > 0 || filters.salesRep.length > 0 || filters.supplier.length > 0) && (<button onClick={(e) => { e.stopPropagation(); clearFilters(); }} className="text-[10px] text-background bg-primary hover:bg-primary/80 font-bold px-3 py-1.5 rounded transition-colors">LIMPAR</button>)}
                    <svg className={`w-4 h-4 text-text-dim transition-transform ${isFiltersOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
            </div>
            {isFiltersOpen && (
                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 bg-card">
                     {[ { label: 'Setor', key: 'sector', options: filterOptions.sectors }, { label: 'Representante', key: 'salesRep', options: filterOptions.reps }, { label: 'Fornecedor', key: 'supplier', options: filterOptions.suppliers }].map((filter) => (
                        <div key={filter.key}>
                            <label className="block text-[10px] font-bold text-text-dim uppercase tracking-wider mb-2 flex justify-between">{filter.label} <span className="text-primary/50">({filter.options.length})</span></label>
                            <div className="relative">
                              <select className="w-full bg-background border border-white/10 text-white text-xs rounded-lg block p-3 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors appearance-none" value={filters[filter.key as keyof FilterState][0] || 'all'} onChange={(e) => handleFilterChange(filter.key as keyof FilterState, e.target.value)}>
                                  <option value="all">Todos</option>
                                  {filter.options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                              </select>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8 mb-8">
            <div className="xl:col-span-3 space-y-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    <StatCard title="Faturamento (Nov)" value={`R$ ${currentMonthKPIs.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={<span className="text-xl">💰</span>} trend={trends.revenue} trendLabel="vs. Média (3 meses)" />
                     <StatCard title="Positivação (Nov)" value={`${currentMonthKPIs.positivacao}`} trendLabel="vs. Média (3 meses)" trend={trends.positivacao} icon={<span className="text-xl">👥</span>} />
                     <StatCard title="Ticket Médio (Nov)" value={`R$ ${currentMonthKPIs.averageTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={<span className="text-xl">📈</span>} trend={trends.ticket} trendLabel="vs. Média (3 meses)" />
                     <StatCard title="SKU x PDV (Nov)" value={currentMonthKPIs.skuPerPdv.toFixed(2)} trendLabel="vs. Média (3 meses)" trend={trends.sku} icon={<span className="text-xl">📊</span>} />
                </div>

                {/* --- SECTOR MATRIX HEATMAP TABLES --- */}
                <div className="space-y-6">
                    <h3 className="text-sm font-bold text-text-dim uppercase tracking-widest mb-4">Análise Matricial por Setor (Evolução Mensal)</h3>
                    
                    <div className="grid grid-cols-1 gap-8">
                         <KPIPivotTable title="Faturamento (R$)" data={pivotData} dataKey="totalRevenue" formatter={fmtCurrency2} highlightHigh={true} />
                         <KPIPivotTable title="Positivação (Clientes)" data={pivotData} dataKey="positivacao" formatter={fmtInt} averageFormatter={fmtNumber1} highlightHigh={true} />
                         <KPIPivotTable title="Pedidos" data={pivotData} dataKey="totalOrders" formatter={fmtInt} averageFormatter={fmtNumber1} highlightHigh={true} />
                         <KPIPivotTable title="Ticket Médio (R$)" data={pivotData} dataKey="averageTicket" formatter={(v) => `R$ ${v.toLocaleString('pt-BR', {maximumFractionDigits:0})}`} averageFormatter={fmtCurrency1} highlightHigh={true} />
                         <KPIPivotTable title="SKU x PDV" data={pivotData} dataKey="skuPerPdv" formatter={(v) => v.toFixed(2)} averageFormatter={fmtNumber1} highlightHigh={true} />
                         <KPIPivotTable title="Prazo Médio (Dias)" data={pivotData} dataKey="avgTerm" formatter={(v) => v.toFixed(0)} averageFormatter={fmtNumber1} highlightHigh={false} />
                         <KPIPivotTable title="Parcela Média (Vezes)" data={pivotData} dataKey="avgInstallments" formatter={(v) => v.toFixed(1)} averageFormatter={fmtNumber1} highlightHigh={false} />
                    </div>
                </div>
            </div>

            <div className="xl:col-span-1">
                <div className="sticky top-28 h-[calc(100vh-8rem)]">
                    <InsightsPanel kpis={currentMonthKPIs} avgKpis={avgHistoryKPIs} filters={filters} topClients={clientStats.slice(0, 5).map(c => ({ id: c.id, name: c.name, value: c.revenue, subValue: c.orders }))} topProducts={productStats.slice(0, 5).map(p => ({ id: p.code, name: p.desc, value: p.revenue, subValue: p.quantity }))} topReps={topReps} />
                </div>
            </div>
        </div>

        <div className="bg-card rounded-xl border border-white/5 overflow-hidden shadow-xl mb-10">
            <div className="p-6 border-b border-white/5 bg-card/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
               <div><h2 className="text-lg font-bold text-white">Análise Detalhada</h2><p className="text-xs text-text-dim">Comparativo de performance: Novembro vs Média (Ago-Out)</p></div>
               <div className="flex items-center gap-4">
                   <button onClick={handleExportCSV} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-md text-xs font-bold transition-all uppercase tracking-wide"><DownloadIcon /> Exportar CSV</button>
                   <div className="relative w-full sm:w-64">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><SearchIcon /></div>
                      <input type="text" placeholder="Filtrar..." className="block w-full pl-10 pr-3 py-2 border border-white/10 rounded-lg bg-background text-white placeholder-text-dim focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-xs transition-all" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                   </div>
               </div>
            </div>
            <div className="border-b border-white/5 bg-background/50 px-6 flex gap-8 overflow-x-auto">
                {[{ id: 'clients', label: 'Clientes' }, { id: 'products', label: 'Produtos' }, { id: 'suppliers', label: 'Fornecedores' }, { id: 'redes', label: 'Redes' }].map(tab => (
                    <button key={tab.id} onClick={() => { setActiveTab(tab.id as any); setSearchTerm(''); }} className={`py-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all whitespace-nowrap ${activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-text-dim hover:text-white hover:border-white/20'}`}>{tab.label}</button>
                ))}
            </div>
            <div className="p-0 bg-background/30">
                {activeTab === 'clients' && <EntityTable headers={['Cód. Cliente', 'Razão Social', 'Região', 'Setor', 'Faturamento (Nov)', 'SKU x PDV', 'Pedidos', 'Ticket Médio', 'Parc. Média', 'Prazo Médio']} data={paginatedData} type="client" />}
                {activeTab === 'products' && (
                    <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
                        <table className="w-full text-sm text-left"><thead className="text-xs text-primary font-bold uppercase bg-card border-b border-white/5 sticky top-0 z-10"><tr><th className="px-6 py-4">Código</th><th className="px-6 py-4">Descrição</th><th className="px-6 py-4">Fornecedor</th><th className="px-6 py-4 text-right">Faturamento</th><th className="px-6 py-4 text-right">Quantidade</th><th className="px-6 py-4 text-right">Clientes</th><th className="px-6 py-4 text-right">Pedidos</th></tr></thead>
                            <tbody className="divide-y divide-white/5">{paginatedData.map((item: any, idx) => (<tr key={idx} className="hover:bg-white/5 transition-colors group"><td className="px-6 py-4 font-mono text-xs text-text-dim group-hover:text-primary">{item.code}</td><td className="px-6 py-4 font-bold text-text-main group-hover:text-primary uppercase text-xs">{item.desc}</td><td className="px-6 py-4 text-text-dim text-xs uppercase">{item.supplier}</td><td className="px-6 py-4 text-right font-bold text-text-main">R$ {item.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td className="px-6 py-4 text-right text-text-dim font-mono">{item.quantity}</td><td className="px-6 py-4 text-right text-text-dim">{item.clientCount}</td><td className="px-6 py-4 text-right text-text-dim">{item.orderCount}</td></tr>))}</tbody></table>
                    </div>
                )}
                {activeTab === 'suppliers' && <EntityTable headers={['Fornecedor', 'Nome', 'Região', 'Setor', 'Faturamento (Nov)', 'Mix (SKUs)', 'Pedidos', 'Ticket Médio', 'Parc. Média', 'Prazo Médio']} data={paginatedData} type="supplier" />}
                {activeTab === 'redes' && <EntityTable headers={['Rede', 'Nome', 'Região', 'Setor', 'Faturamento (Nov)', 'SKU x PDV', 'Pedidos', 'Ticket Médio', 'Parc. Média', 'Prazo Médio']} data={paginatedData} type="network" />}
            </div>
            
            {/* --- PAGINATION CONTROLS --- */}
            <div className="px-6 py-4 border-t border-white/5 bg-card/50 flex items-center justify-between">
                <span className="text-xs text-text-dim">Mostrando {Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, currentData.length)} a {Math.min(currentPage * ITEMS_PER_PAGE, currentData.length)} de {currentData.length} registros</span>
                <div className="flex items-center gap-2">
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-50 rounded text-xs font-bold text-white transition-colors">Anterior</button>
                    <span className="text-xs font-mono text-primary mx-2">Pág {currentPage} de {totalPages}</span>
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-50 rounded text-xs font-bold text-white transition-colors">Próximo</button>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 gap-8 mb-8">
             <div className="bg-card rounded-xl border border-white/5 shadow-xl p-6">
                 <h2 className="text-lg font-bold text-white mb-2">Geointeligência de Vendas</h2>
                 <p className="text-xs text-text-dim mb-4">Concentração de Faturamento por Cidade (Círculos) e Intensidade de Vendas (Cores)</p>
                 <SalesHeatmap data={geoStats} />
             </div>
        </div>

      </main>
    </div>
  );
}

// --- KPI Pivot Table Component (Matrix Heatmap) ---
const KPIPivotTable = ({ title, data, dataKey, formatter, averageFormatter, highlightHigh = true }: { title: string, data: any, dataKey: keyof KPIStats, formatter: (val: number) => string, averageFormatter?: (val: number) => string, highlightHigh?: boolean }) => {
    // Dynamic Sorting: Sort specific to this table's metric
    const sortedRows = [...data.rows].sort((a: any, b: any) => {
        const valA = a.total[dataKey] || 0;
        const valB = b.total[dataKey] || 0;
        return valB - valA; // Descending
    });

    // Determine Color Scale
    const values: number[] = [];
    data.rows.forEach((row: any) => {
        Object.values(row.months).forEach((stats: any) => values.push(stats[dataKey] as number));
    });
    const max = Math.max(...values, 1);
    const min = Math.min(...values);

    const getColor = (val: number) => {
        if (val === 0) return 'text-text-dim opacity-30';
        const percent = (val - min) / (max - min);
        
        if (highlightHigh) {
            if (percent > 0.66) return 'text-success font-bold';
            if (percent > 0.33) return 'text-warning font-medium';
            return 'text-danger font-medium';
        } else {
            if (percent > 0.66) return 'text-text-main font-bold';
            return 'text-text-dim';
        }
    };

    const monthNames = ["Ago", "Set", "Out", "Nov"];
    const monthKeys = ["2025-08", "2025-09", "2025-10", "2025-11"]; 
    const avgFmt = averageFormatter || formatter;

    const isRatioMetric = ['skuPerPdv', 'averageTicket', 'avgTerm', 'avgInstallments'].includes(dataKey);

    const calculateColumnTotal = (mKey: string) => {
        const valuesInColumn = sortedRows.map((row: any) => (row.months[mKey]?.[dataKey] as number) || 0);
        const sum = valuesInColumn.reduce((a: number, b: number) => a + b, 0);
        const count = sortedRows.length; // Always divide by total visible rows for Arithmetic Mean (Visual Proof)

        if (count === 0) return 0;
        return isRatioMetric ? sum / count : sum;
    };

    const calculateGrandTotal = () => {
         let sum = 0;
         const count = sortedRows.length;
         sortedRows.forEach((row: any) => {
             sum += (row.total[dataKey] as number) || 0;
         });
         if (count === 0) return 0;
         return isRatioMetric ? sum / count : sum;
    }

    return (
        <div className="bg-card rounded-xl border border-white/5 shadow-lg overflow-hidden flex flex-col">
            <div className="px-4 py-3 bg-card/80 border-b border-white/10 flex justify-between items-center">
                <h4 className="text-xs font-bold text-text-main uppercase tracking-widest">{title}</h4>
            </div>
            <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-xs text-right">
                    <thead className="bg-white/5 text-text-dim font-mono uppercase">
                        <tr>
                            <th className="px-3 py-2 text-left w-32 sticky left-0 bg-[#151E32] z-10 border-r border-white/5">Setor</th>
                            {monthNames.map(m => <th key={m} className="px-3 py-2 w-20">{m}</th>)}
                            <th className="px-3 py-2 w-24 bg-white/10 font-bold text-white">Média (Ago-Out)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {sortedRows.map((row: any, i: number) => (
                            <tr key={i} className="hover:bg-white/5 transition-colors">
                                <td className="px-3 py-2 text-left font-bold text-text-dim sticky left-0 bg-card border-r border-white/5 truncate max-w-[150px]" title={row.sector}>{row.sector}</td>
                                {monthKeys.map(mKey => {
                                    const val = (row.months[mKey]?.[dataKey] as number) || 0;
                                    return (
                                        <td key={mKey} className={`px-3 py-2 ${getColor(val)}`}>
                                            {formatter(val)}
                                        </td>
                                    );
                                })}
                                <td className="px-3 py-2 font-bold bg-white/5 text-white">
                                    {avgFmt(row.total[dataKey])}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-white/5 border-t border-white/10 font-bold">
                        <tr>
                            <td className="px-3 py-2 text-left text-primary sticky left-0 bg-[#151E32] border-r border-white/5">TOTAL</td>
                            {monthKeys.map(mKey => (
                                <td key={mKey} className="px-3 py-2 text-primary">
                                    {formatter(calculateColumnTotal(mKey))}
                                </td>
                            ))}
                            <td className="px-3 py-2 text-primary bg-white/10">
                                {avgFmt(calculateGrandTotal())}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

const EntityTable = ({ headers, data, type }: { headers: string[], data: any[], type: 'client' | 'supplier' | 'network' }) => (
    <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
        <table className="w-full text-sm text-left relative">
            <thead className="text-xs text-primary font-bold uppercase bg-card border-b border-white/5 sticky top-0 z-10">
                <tr>
                    <th className="px-6 py-4">{headers[0]}</th>
                    <th className="px-6 py-4">{headers[1]}</th>
                    {(type === 'client' || type === 'supplier' || type === 'network') && (
                        <>
                           <th className="px-6 py-4">Região</th>
                           <th className="px-6 py-4">Setor</th>
                        </>
                    )}
                    <th className="px-6 py-4 text-right">{headers[4]}</th>
                    <th className="px-6 py-4 text-right">{headers[5]}</th>
                    <th className="px-6 py-4 text-right">{headers[6]}</th>
                    <th className="px-6 py-4 text-right">{headers[7]}</th>
                    <th className="px-6 py-4 text-right">{headers[8]}</th>
                    <th className="px-6 py-4 text-right">{headers[9]}</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
                {data.map((item, idx) => {
                    const trend = item.revenueTrend || 0;
                    return (
                        <tr key={idx} className="hover:bg-white/5 transition-colors group">
                            <td className="px-6 py-4 text-text-dim font-mono text-xs">{item.id.split('/')[0].replace(/\D/g, '')}</td>
                            <td className="px-6 py-4 font-bold text-text-main group-hover:text-primary max-w-[250px] truncate" title={item.name}>{item.name}</td>
                            {(type === 'client' || type === 'supplier' || type === 'network') && (
                                <>
                                    <td className="px-6 py-4 text-xs uppercase text-text-dim">{item.region || '-'}</td>
                                    <td className="px-6 py-4 text-xs uppercase text-text-dim">{item.sector || '-'}</td>
                                </>
                            )}
                            <td className="px-6 py-4 text-right font-bold text-text-main">
                                <div className="flex items-center justify-end gap-2">
                                    <span>R$ {item.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    <TrendIndicator value={trend} />
                                </div>
                                <div className="text-[9px] text-text-dim opacity-50 font-normal">Média: R$ {item.averagePastRevenue?.toLocaleString('pt-BR', { maximumFractionDigits:0 })}</div>
                            </td>
                            <td className="px-6 py-4 text-right text-text-dim">
                                {(type === 'supplier' && 'skuCount' in item) ? (item as any).skuCount : item.skuPerPdv?.toFixed(2) || '-'}
                            </td>
                            <td className="px-6 py-4 text-right text-text-dim">{item.orders}</td>
                            <td className="px-6 py-4 text-right text-text-dim">R$ {item.avgTicket?.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</td>
                            <td className="px-6 py-4 text-right text-text-dim">
                                <div className="flex items-center justify-end gap-2">
                                    {item.avgInstallments?.toFixed(1)}x
                                </div>
                            </td>
                            <td className="px-6 py-4 text-right text-text-dim">
                                <div className="flex items-center justify-end gap-2">
                                    {item.avgTerm?.toFixed(0)} dias
                                </div>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    </div>
);

export default App;