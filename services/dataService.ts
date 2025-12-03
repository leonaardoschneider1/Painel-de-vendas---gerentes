import { SaleRecord, Channel, FilterState, KPIStats, ChartDataPoint, EntityStats, ProductStats, MonthlyMetric, SupplierStats, GeoStats } from '../types';
import Papa from 'papaparse';

// --- GOOGLE SHEETS FETCHING ---

const GOOGLE_SHEET_ID = '1qQVshadN_2h0mZTTeE5Ao23bNXPHgOqVacjWp_KPDXs';
const GOOGLE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:csv`;

export const fetchGoogleSheetsData = async (): Promise<SaleRecord[]> => {
  try {
    const response = await fetch(GOOGLE_SHEET_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.statusText}`);
    }
    const csvText = await response.text();
    return parseCSV(csvText);
  } catch (error) {
    console.error("Error fetching Google Sheet:", error);
    return [];
  }
};

// --- CSV PARSING ---

export const parseCSV = (csvText: string): SaleRecord[] => {
  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const records: SaleRecord[] = [];
  const rows = result.data as any[];

  rows.forEach((row, index) => {
    try {
      const parseAmount = (val: string) => {
        if (!val) return 0;
        let str = val.toString().trim();
        
        // Handle negative currency strings like "-R$ 1.000,00" or "R$ -1.000,00"
        const isExplicitNegative = str.includes('-');

        // Remove R$ (case insensitive) and spaces
        str = str.replace(/R\$/gi, '').trim();
        
        // Remove everything that is NOT digit, comma, or dot
        // We temporarily remove the minus sign here to parse the number cleanly
        let clean = str.replace(/[^0-9,.]/g, ''); 

        // Brazilian Format Logic:
        // 1.234,56 -> 1234.56
        // 1.000 -> 1000
        // 100,50 -> 100.50
        if (clean.includes(',') && clean.includes('.')) {
             clean = clean.replace(/\./g, '').replace(',', '.');
        } else if (clean.includes(',')) {
             clean = clean.replace(',', '.');
        }
        
        const num = parseFloat(clean);
        if (isNaN(num)) return 0;
        
        // Apply sign
        return isExplicitNegative ? -Math.abs(num) : num;
      };

      const parseDate = (val: string) => {
        if (!val) return '';
        if (val.match(/^\d{4}-\d{2}-\d{2}$/)) return val;
        const parts = val.split('/');
        if (parts.length === 3) {
          return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        return '';
      };
      
      const sector = row['Setor'] || 'N/A';
      
      const region = row['Região'] || row['Regiao'] || 'N/A';
      const division = row['Divisão'] || row['Divisao'] || 'N/A';
      const channelStr = row['Canal'] || 'N/A';
      const channel = Object.values(Channel).includes(channelStr as Channel) ? (channelStr as Channel) : Channel.VD; 
      
      const amountStr = row['SOMA Valor'] || row['Valor'] || row['Faturamento'] || '0';
      const amount = parseAmount(amountStr);

      const qtyStr = row['SOMA Quantidade'] || row['Quantidade'] || '0';
      const quantity = parseInt(qtyStr, 10) || 0;

      const dateStr = row['Data NFE'] || row['Data'] || '';
      const date = parseDate(dateStr);

      const cnpj = row['CNPJ'] || row['Cliente'] || `UNKNOWN-${index}`; 
      const companyName = row['Razão Social'] || row['Razao Social'] || row['Nome'] || 'Cliente Desconhecido';
      
      const productCode = row['Cód. Produto'] || row['Cod. Produto'] || row['Produto'] || 'N/A';
      const productDesc = row['Descrição'] || row['Descricao'] || 'Produto Desconhecido';
      
      const orderId = row['Num. Pedido'] || row['Pedido'] || `UNK-${index}`;
      
      const operClass = (row['Classe Oper.'] === 'DV' || row['Classe Oper'] === 'DV') ? 'DV' : 'VD';
      
      const paymentTerms = row['Prazos'] || row['Cond. Pagto'] || '';
      
      const networkName = row['Nome Rede A'] || row['Nome Rede R/I'] || row['Rede'] || 'Independente';
      const supplier = row['Fornecedor'] || 'N/A';
      const salesRep = row['Representante da venda'] || row['Representante'] || 'N/A';
      
      // Capture Geo Info if available (Common in Brazilian ERP exports)
      const city = row['Cidade'] || row['Município'] || row['Municipio'] || row['City'] || '';
      const state = row['UF'] || row['Estado'] || row['State'] || '';

      if (date) {
        records.push({
          id: `ROW-${index}`,
          date,
          region,
          division,
          sector,
          salesRep,
          channel,
          supplier,
          cnpj,
          companyName,
          productCode,
          productDesc,
          amount,
          quantity,
          orderId,
          operClass,
          paymentTerms,
          networkName,
          city,
          state
        });
      }
    } catch (e) {
      console.warn(`Error parsing row ${index}`, e);
    }
  });

  return records.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

// --- FILTER LOGIC ---

export const filterData = (data: SaleRecord[], filters: FilterState): SaleRecord[] => {
  return data.filter(record => {
    const recordMonth = record.date.substring(0, 7); 
    
    const inDateRange = recordMonth >= filters.startMonth && recordMonth <= filters.endMonth;

    const matches = (recordValue: string, filterValues: string[]) => {
        if (!filterValues || filterValues.length === 0 || filterValues.includes('all')) return true;
        return filterValues.includes(recordValue);
    };

    const matchesDivision = matches(record.division, filters.division);
    const matchesRegion = matches(record.region, filters.region);
    const matchesSector = matches(record.sector, filters.sector);
    const matchesRep = matches(record.salesRep, filters.salesRep);
    const matchesChannel = matches(record.channel, filters.channel);
    const matchesSupplier = matches(record.supplier, filters.supplier);

    return matchesDivision && matchesRegion && matchesSector && matchesRep && matchesChannel && matchesSupplier && inDateRange;
  });
};

export const getCascadingOptions = (data: SaleRecord[], currentFilters: FilterState) => {
  const getOptionsFor = (key: keyof SaleRecord, filtersToApply: Partial<FilterState>) => {
    const subset = data.filter(record => {
        const recordMonth = record.date.substring(0, 7);
        if (recordMonth < currentFilters.startMonth || recordMonth > currentFilters.endMonth) return false;

        if (filtersToApply.division && !filtersToApply.division.includes('all') && filtersToApply.division.length > 0 && !filtersToApply.division.includes(record.division)) return false;
        if (filtersToApply.region && !filtersToApply.region.includes('all') && filtersToApply.region.length > 0 && !filtersToApply.region.includes(record.region)) return false;
        if (filtersToApply.sector && !filtersToApply.sector.includes('all') && filtersToApply.sector.length > 0 && !filtersToApply.sector.includes(record.sector)) return false;
        if (filtersToApply.salesRep && !filtersToApply.salesRep.includes('all') && filtersToApply.salesRep.length > 0 && !filtersToApply.salesRep.includes(record.salesRep)) return false;
        if (filtersToApply.channel && !filtersToApply.channel.includes('all') && filtersToApply.channel.length > 0 && !filtersToApply.channel.includes(record.channel)) return false;
        if (filtersToApply.supplier && !filtersToApply.supplier.includes('all') && filtersToApply.supplier.length > 0 && !filtersToApply.supplier.includes(record.supplier)) return false;
        return true;
    });
    return Array.from(new Set(subset.map(r => r[key] as string))).filter(Boolean).sort();
  };
  
  const { division, ...filtersNoDivision } = currentFilters;
  const divisions = getOptionsFor('division', filtersNoDivision);

  const { region, ...filtersNoRegion } = currentFilters;
  const regions = getOptionsFor('region', filtersNoRegion);

  const { sector, ...filtersNoSector } = currentFilters;
  const sectors = getOptionsFor('sector', filtersNoSector);

  const { salesRep, ...filtersNoRep } = currentFilters;
  const reps = getOptionsFor('salesRep', filtersNoRep);

  const { channel, ...filtersNoChannel } = currentFilters;
  const channels = getOptionsFor('channel', filtersNoChannel); 

  const { supplier, ...filtersNoSupplier } = currentFilters;
  const suppliers = getOptionsFor('supplier', filtersNoSupplier);

  return { divisions, regions, sectors, reps, channels, suppliers };
};

// --- KPI CALCULATIONS ---

const calculateStatsInternal = (data: SaleRecord[]) => {
    // 1. Faturamento (Líquido: Vendas + Devoluções Negativas)
    const totalRevenue = data.reduce((acc, curr) => acc + curr.amount, 0);
  
    // 2. Positivação (Clientes Ativos: Saldo Líquido > 0)
    const clientNetRevenue: Record<string, number> = {};
    data.forEach(r => {
        clientNetRevenue[r.cnpj] = (clientNetRevenue[r.cnpj] || 0) + r.amount;
    });
    // Cliente só conta como positivado se o saldo final for positivo
    const activeClients = Object.entries(clientNetRevenue)
        .filter(([_, netVal]) => netVal > 0)
        .map(([id]) => id);
        
    const positivacao = activeClients.length;
  
    // 3. Pedidos (Líquido: Pedidos Venda - Pedidos Devolução)
    const sales = data.filter(r => r.operClass === 'VD');
    const returns = data.filter(r => r.operClass === 'DV');
    
    const distinctOrdersVD = new Set(sales.map(r => r.orderId)).size;
    const distinctOrdersDV = new Set(returns.map(r => r.orderId)).size;
    // Evita negativo
    const totalOrders = Math.max(0, distinctOrdersVD - distinctOrdersDV);
  
    // 4. Ticket Médio (Faturamento Líquido / Pedidos Líquidos)
    const averageTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  
    // 5. SKU x PDV (Média de SKUs distintos LÍQUIDOS por cliente POSITIVADO)
    // Regra: Se vendeu 15 itens distintos e devolveu 3 distintos, SKU = 12.
    const clientSkuMap: Record<string, { vd: Set<string>, dv: Set<string> }> = {};
    
    data.forEach(r => {
        if (!clientSkuMap[r.cnpj]) {
            clientSkuMap[r.cnpj] = { vd: new Set(), dv: new Set() };
        }
        if (r.operClass === 'VD') {
            clientSkuMap[r.cnpj].vd.add(r.productCode);
        } else if (r.operClass === 'DV') {
            clientSkuMap[r.cnpj].dv.add(r.productCode);
        }
    });

    let totalNetSkus = 0;
    
    // Calcula apenas para clientes que estão financeiramente positivados
    activeClients.forEach(cnpj => {
        if (clientSkuMap[cnpj]) {
            const vdCount = clientSkuMap[cnpj].vd.size;
            const dvCount = clientSkuMap[cnpj].dv.size;
            // Subtração simples de contagem de SKUs distintos, conforme regra do usuário.
            const netSkus = Math.max(0, vdCount - dvCount);
            totalNetSkus += netSkus;
        }
    });

    const skuPerPdv = positivacao > 0 ? totalNetSkus / positivacao : 0;
  
    // 6. Parcela Média (Weighted) - Considera apenas Vendas (VD) para não distorcer prazos com devoluções
    let totalWeightedInstallments = 0;
    let totalSalesForInstallments = 0;
  
    sales.forEach(r => {
      if (r.paymentTerms) {
          let installmentCount = 0;
          const dateMatches = r.paymentTerms.match(/\d{2}\/\d{2}\/\d{4}/g);
          if (dateMatches && dateMatches.length > 0) {
              installmentCount = dateMatches.length;
          } else {
             const count = r.paymentTerms.split(/[-\/]/).filter(s => s.trim().length > 0).length;
             if (count > 0) installmentCount = count;
          }

          if (installmentCount > 0) {
              totalWeightedInstallments += (installmentCount * r.amount);
              totalSalesForInstallments += r.amount;
          }
      }
    });
    const avgInstallments = totalSalesForInstallments > 0 ? totalWeightedInstallments / totalSalesForInstallments : 0;
  
    // 7. Prazo Médio (Weighted by Amount) - Apenas Vendas
    let totalWeightedDays = 0;
    let totalSalesForTerm = 0;
    const orderTermCache: Record<string, number> = {};

    sales.forEach(r => {
      if (r.paymentTerms && r.date) {
        let avgDaysForOrder = 0;
        if (orderTermCache[r.orderId] !== undefined) {
             avgDaysForOrder = orderTermCache[r.orderId];
        } else {
            const [y, m, d] = r.date.split('-').map(Number);
            const nfeDate = new Date(y, m - 1, d); 
            const dateMatches = [...r.paymentTerms.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)];
            if (dateMatches.length > 0) {
                let currentOrderTotalDays = 0;
                dateMatches.forEach(match => {
                    const day = parseInt(match[1], 10);
                    const month = parseInt(match[2], 10) - 1; 
                    const year = parseInt(match[3], 10);
                    const dueDate = new Date(year, month, day);
                    const diffTime = dueDate.getTime() - nfeDate.getTime();
                    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)); 
                    currentOrderTotalDays += diffDays;
                });
                avgDaysForOrder = currentOrderTotalDays / dateMatches.length;
            } else {
                const daysParts = r.paymentTerms.split(/[-\/]/).map(d => parseInt(d, 10));
                let validDaysCount = 0;
                let validDaysSum = 0;
                daysParts.forEach(day => {
                    if (!isNaN(day) && day > 0 && day < 2000) { 
                    validDaysSum += day;
                    validDaysCount++;
                    }
                });
                if (validDaysCount > 0) avgDaysForOrder = validDaysSum / validDaysCount;
            }
            orderTermCache[r.orderId] = avgDaysForOrder;
        }
        if (avgDaysForOrder >= 0) {
            totalWeightedDays += (avgDaysForOrder * r.amount);
            totalSalesForTerm += r.amount;
        }
      }
    });
    const avgTerm = totalSalesForTerm > 0 ? totalWeightedDays / totalSalesForTerm : 0;

    return { totalRevenue, positivacao, totalOrders, averageTicket, skuPerPdv, avgInstallments, avgTerm };
};

export const calculateKPIs = (data: SaleRecord[]): KPIStats => {
    return calculateStatsInternal(data);
};

// --- AGGREGATIONS ---

export const getMonthlyEvolution = (data: SaleRecord[]): MonthlyMetric[] => {
    const grouped: Record<string, SaleRecord[]> = {};
    data.forEach(r => {
        const monthKey = r.date.substring(0, 7);
        if (!grouped[monthKey]) grouped[monthKey] = [];
        grouped[monthKey].push(r);
    });
    const metrics = Object.entries(grouped).map(([monthKey, records]) => {
        const stats = calculateStatsInternal(records);
        const [year, month] = monthKey.split('-');
        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const name = monthNames[parseInt(month) - 1] || monthKey;
        return { name: name, sortKey: monthKey, revenue: stats.totalRevenue, positivacao: stats.positivacao, ticketMedio: stats.averageTicket, skuPdv: stats.skuPerPdv };
    });
    return metrics.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
};

export const getSectorMonthlyEvolution = (data: SaleRecord[]) => {
    const grouped: Record<string, SaleRecord[]> = {};
    data.forEach(r => {
        const monthKey = r.date.substring(0, 7);
        if (!grouped[monthKey]) grouped[monthKey] = [];
        grouped[monthKey].push(r);
    });
    const metrics = Object.entries(grouped).map(([monthKey, records]) => {
        const [year, month] = monthKey.split('-');
        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const name = monthNames[parseInt(month) - 1] || monthKey;
        const row: any = { name: name, sortKey: monthKey };
        const sectorGroups: Record<string, SaleRecord[]> = {};
        records.forEach(r => {
             const s = r.sector || 'N/A';
             if (!sectorGroups[s]) sectorGroups[s] = [];
             sectorGroups[s].push(r);
        });
        Object.entries(sectorGroups).forEach(([sector, sRecords]) => {
             const stats = calculateStatsInternal(sRecords);
             row[sector] = { revenue: stats.totalRevenue, positivacao: stats.positivacao, ticketMedio: stats.averageTicket, skuPdv: stats.skuPerPdv };
        });
        return row;
    });
    return metrics.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
};

export const getSectorPivotData = (data: SaleRecord[]) => {
    const months = Array.from(new Set(data.map(r => r.date.substring(0, 7)))).sort();
    const sectors = Array.from(new Set(data.map(r => r.sector))).sort();
    const closedMonths = ['2025-08', '2025-09', '2025-10'];
    const monthTotals: Record<string, KPIStats> = {};
    months.forEach(m => {
        const monthlyRecords = data.filter(r => r.date.startsWith(m));
        monthTotals[m] = calculateStatsInternal(monthlyRecords);
    });
    const calculateAverageOfMonths = (monthDataMap: Record<string, KPIStats>): KPIStats => {
        const stats: any = {};
        const keys: (keyof KPIStats)[] = ['totalRevenue', 'positivacao', 'totalOrders', 'averageTicket', 'skuPerPdv', 'avgInstallments', 'avgTerm'];
        keys.forEach(key => {
            let sum = 0;
            closedMonths.forEach(m => { if (monthDataMap[m]) sum += monthDataMap[m][key]; });
            stats[key] = sum / 3;
        });
        return stats as KPIStats;
    };
    const grandTotal = calculateAverageOfMonths(monthTotals);
    const rows = sectors.map(sector => {
        const sectorRecords = data.filter(r => r.sector === sector);
        const monthStats: Record<string, KPIStats> = {};
        months.forEach(m => {
            const smRecords = sectorRecords.filter(r => r.date.startsWith(m));
            monthStats[m] = calculateStatsInternal(smRecords);
        });
        const rowAverage = calculateAverageOfMonths(monthStats);
        return { sector, months: monthStats, total: rowAverage };
    });
    rows.sort((a, b) => b.total.totalRevenue - a.total.totalRevenue);
    return { rows, months, monthTotals, grandTotal };
};

const getStatsByGroup = (data: SaleRecord[], groupKeyFn: (r: SaleRecord) => string): EntityStats[] => {
  const groups: Record<string, { records: SaleRecord[], name: string, region: string, sector: string }> = {};
  data.forEach(r => {
    const key = groupKeyFn(r);
    if (!key || key === 'N/A' || key === 'undefined') return;
    if (!groups[key]) groups[key] = { records: [], name: key, region: r.region, sector: r.sector };
    groups[key].records.push(r);
    if (r.companyName && key === r.cnpj) groups[key].name = r.companyName; 
  });
  return Object.entries(groups).map(([id, group]) => {
    const novRecords = group.records.filter(r => r.date.startsWith('2025-11'));
    const novStats = calculateStatsInternal(novRecords);
    const augRev = calculateStatsInternal(group.records.filter(r => r.date.startsWith('2025-08'))).totalRevenue;
    const sepRev = calculateStatsInternal(group.records.filter(r => r.date.startsWith('2025-09'))).totalRevenue;
    const octRev = calculateStatsInternal(group.records.filter(r => r.date.startsWith('2025-10'))).totalRevenue;
    const avgPastRevenue = (augRev + sepRev + octRev) / 3;
    const currentRevenue = novStats.totalRevenue;
    let revenueTrend = 0;
    if (avgPastRevenue > 0) revenueTrend = ((currentRevenue - avgPastRevenue) / avgPastRevenue) * 100;
    else if (currentRevenue > 0) revenueTrend = 100;
    return {
      id: id,
      name: group.name,
      revenue: currentRevenue,
      averagePastRevenue: avgPastRevenue,
      revenueTrend: revenueTrend,
      currentRevenue: currentRevenue,
      orders: novStats.totalOrders,
      skuPerPdv: novStats.skuPerPdv,
      avgTicket: novStats.averageTicket,
      avgInstallments: novStats.avgInstallments,
      avgTerm: novStats.avgTerm,
      region: group.region,
      sector: group.sector
    };
  }).sort((a, b) => b.revenue - a.revenue);
};

export const getNetworkStats = (data: SaleRecord[]): EntityStats[] => getStatsByGroup(data, (r) => r.networkName);
export const getClientStats = (data: SaleRecord[]): EntityStats[] => getStatsByGroup(data, (r) => r.cnpj);
export const getSupplierStats = (data: SaleRecord[]): SupplierStats[] => {
    const stats = getStatsByGroup(data, (r) => r.supplier);
    return stats.map(s => {
         const suppRecords = data.filter(r => r.supplier === s.id && r.operClass === 'VD' && r.date.startsWith('2025-11'));
         const skuCount = new Set(suppRecords.map(r => r.productCode)).size;
         return { ...s, skuCount };
    }).sort((a, b) => b.revenue - a.revenue);
};
export const getProductStats = (data: SaleRecord[]): ProductStats[] => {
    const map: Record<string, ProductStats & { uniqueClients: Set<string>, uniqueOrders: Set<string> }> = {};
    const novData = data.filter(r => r.date.startsWith('2025-11')); 
    novData.forEach(r => {
        if (!map[r.productCode]) map[r.productCode] = { code: r.productCode, desc: r.productDesc, revenue: 0, quantity: 0, supplier: r.supplier, division: r.division, uniqueClients: new Set(), uniqueOrders: new Set(), clientCount: 0, orderCount: 0 };
        // Revenue handles itself (amount is negative for DV)
        const val = r.amount;
        // Quantity must be handled explicitly: Subtract if DV, Add if VD
        const qtyAbs = Math.abs(r.quantity);
        const qty = r.operClass === 'DV' ? -qtyAbs : qtyAbs;
        
        map[r.productCode].revenue += val;
        map[r.productCode].quantity += qty;
        if (r.operClass === 'VD') { map[r.productCode].uniqueClients.add(r.cnpj); map[r.productCode].uniqueOrders.add(r.orderId); }
    });
    return Object.values(map).map(p => ({ ...p, clientCount: p.uniqueClients.size, orderCount: p.uniqueOrders.size })).sort((a,b) => b.revenue - a.revenue);
};
export const getRepStats = (data: SaleRecord[]): EntityStats[] => getStatsByGroup(data, (r) => r.salesRep);

// --- GEO INTELLIGENCE ---
// ... (Geo code remains unchanged)
// Embedding the FULL Coordinate List (Compressed)
// Format: STATE,CITY,LAT,LNG
const RAW_CITIES_CSV = `PR,ABATIA,-23.3049,-50.3133|PR,ADRIANOPOLIS,-24.6606,-48.9922|PR,AGUDOS DO SUL,-25.9899,-49.3343|PR,ALMIRANTE TAMANDARE,-25.3188,-49.3037|PR,ALTAMIRA DO PARANA,-24.7983,-52.7128|PR,ALTO PARAISO,-26.1146,-52.7469|PR,ALTO PARANA,-23.1312,-52.3189|PR,ALTO PIQUIRI,-24.0224,-53.44|PR,ALTONIA,-23.8759,-53.8958|PR,ALVORADA DO SUL,-22.7813,-51.2297|PR,AMAPORA,-23.0943,-52.7866|PR,AMPERE,-25.9168,-53.4686|PR,ANAHY,-24.6449,-53.1332|PR,ANDIRA,-23.0533,-50.2304|PR,ANGULO,-23.1946,-51.9154|PR,ANTONINA,-25.4386,-48.7191|PR,ANTONIO OLINTO,-25.9804,-50.1972|PR,APUCARANA,-23.55,-51.4635|PR,ARAPONGAS,-23.4153,-51.4259|PR,ARAPOTI,-24.1548,-49.8285|PR,ARAPUA,-24.3132,-51.7856|PR,ARARUNA,-23.9315,-52.5021|PR,ARAUCARIA,-25.5859,-49.4047|PR,ARIRANHA DO IVAI,-24.3857,-51.5839|PR,ASSAI,-23.3697,-50.8459|PR,ASSIS CHATEAUBRIAND,-24.4168,-53.5213|PR,ASTORGA,-23.2318,-51.6668|PR,ATALAIA,-23.1517,-52.0551|PR,BALSA NOVA,-25.5804,-49.6291|PR,BANDEIRANTES,-23.1078,-50.3704|PR,BARBOSA FERRAZ,-24.0334,-52.004|PR,BARRA DO JACARE,-23.116,-50.1842|PR,BARRACAO,-26.2502,-53.6324|PR,BELA VISTA DA CAROBA,-25.8842,-53.6725|PR,BELA VISTA DO PARAISO,-22.9937,-51.1927|PR,BITURUNA,-26.1607,-51.5518|PR,BOA ESPERANCA,-24.2467,-52.7876|PR,BOA VENTURA DE SAO ROQUE,-24.8688,-51.6276|PR,BOA VISTA DA APARECIDA,-25.4308,-53.4117|PR,BOCAIUVA DO SUL,-25.2066,-49.1141|PR,BOM SUCESSO,-23.7063,-51.7671|PR,BOM SUCESSO DO SUL,-26.0731,-52.8353|PR,BORRAZOPOLIS,-23.9366,-51.5875|PR,BRAGANEY,-24.8173,-53.1218|PR,BRASILANDIA DO SUL,-24.1978,-53.5275|PR,CAFEARA,-22.789,-51.7142|PR,CAFELANDIA,-24.6189,-53.3207|PR,CAFEZAL DO SUL,-23.9005,-53.5124|PR,CALIFORNIA,-23.6566,-51.3574|PR,CAMBARA,-23.0423,-50.0753|PR,CAMBE,-23.2766,-51.2798|PR,CAMBIRA,-23.589,-51.5792|PR,CAMPINA DA LAGOA,-24.5893,-52.7976|PR,CAMPINA DO SIMAO,-25.0802,-51.8237|PR,CAMPINA GRANDE DO SUL,-25.3044,-49.0551|PR,CAMPO BONITO,-25.0294,-52.9939|PR,CAMPO DO TENENTE,-25.98,-49.6844|PR,CAMPO LARGO,-25.4525,-49.529|PR,CAMPO MAGRO,-25.3687,-49.4501|PR,CAMPO MOURAO,-24.0463,-52.378|PR,CANDIDO DE ABREU,-24.5649,-51.3372|PR,CANDOI,-25.5758,-52.0409|PR,CANTAGALO,-25.3734,-52.1198|PR,CAPANEMA,-25.6691,-53.8055|PR,CAPITAO LEONIDAS MARQUES,-25.4816,-53.6112|PR,CARAMBEI,-24.9152,-50.0986|PR,CARLOPOLIS,-23.4269,-49.7235|PR,CASCAVEL,-24.9573,-53.459|PR,CASTRO,-24.7891,-50.0108|PR,CATANDUVAS,-25.2044,-53.1548|PR,CENTENARIO DO SUL,-22.8188,-51.5973|PR,CERRO AZUL,-26.0891,-52.8691|PR,CEU AZUL,-25.1489,-53.8415|PR,CHOPINZINHO,-25.8515,-52.5173|PR,CIANORTE,-23.6599,-52.6054|PR,CIDADE GAUCHA,-23.3772,-52.9436|PR,CLEVELANDIA,-26.4043,-52.3508|PR,COLOMBO,-25.2925,-49.2262|PR,COLORADO,-22.8374,-51.9743|PR,CONGONHINHAS,-23.5493,-50.5569|PR,CONSELHEIRO MAIRINCK,-23.623,-50.1707|PR,CONTENDA,-25.6788,-49.535|PR,CORBELIA,-24.7971,-53.3006|PR,CORNELIO PROCOPIO,-23.1829,-50.6498|PR,CORONEL DOMINGOS SOARES,-26.2277,-52.0356|PR,CORONEL VIVIDA,-25.9767,-52.5641|PR,CORUMBATAI DO SUL,-24.101,-52.1177|PR,CRUZ MACHADO,-26.0166,-51.343|PR,CRUZEIRO DO IGUACU,-25.6192,-53.1285|PR,CRUZEIRO DO OESTE,-23.7799,-53.0774|PR,CRUZEIRO DO SUL,-22.9624,-52.1622|PR,CRUZMALTINA,-24.0132,-51.4563|PR,CURITIBA,-25.4195,-49.2646|PR,CURIUVA,-24.0362,-50.4576|PR,DIAMANTE DO NORTE,-22.655,-52.8617|PR,DIAMANTE DO OESTE,-24.9462,-54.103|PR,DIAMANTE DO SUL,-25.035,-52.6768|PR,DOIS VIZINHOS,-25.7407,-53.057|PR,DOURADINA,-23.3807,-53.2918|PR,DOUTOR ULYSSES,-24.5665,-49.4219|PR,ENEAS MARQUES,-25.9445,-53.1659|PR,ENGENHEIRO BELTRAO,-23.797,-52.2659|PR,ENTRE RIOS DO OESTE,-24.7042,-54.2385|PR,ESPERANCA NOVA,-23.7238,-53.811|PR,ESPIGAO ALTO DO IGUACU,-25.4216,-52.8348|PR,FAROL,-24.0958,-52.6217|PR,FAXINAL,-24.0077,-51.3227|PR,FAZENDA RIO GRANDE,-25.6624,-49.3073|PR,FENIX,-23.9135,-51.9805|PR,FIGUEIRA,-23.8455,-50.4031|PR,FLOR DA SERRA DO SUL,-26.2523,-53.3092|PR,FLORAI,-23.3178,-52.3029|PR,FLORESTA,-23.6031,-52.0807|PR,FLORESTOPOLIS,-22.8623,-51.3882|PR,FLORIDA,-23.0847,-51.9546|PR,FORMOSA DO OESTE,-24.2951,-53.3114|PR,FOZ DO IGUACU,-25.5427,-54.5827|PR,FOZ DO JORDAO,-25.7371,-52.1188|PR,FRANCISCO ALVES,-24.0667,-53.8461|PR,FRANCISCO BELTRAO,-26.0817,-53.0535|PR,GENERAL CARNEIRO,-26.425,-51.3172|PR,GODOY MOREIRA,-24.173,-51.9246|PR,GOIOERE,-24.1835,-53.0248|PR,GOIOXIM,-25.1927,-51.9911|PR,GRANDES RIOS,-24.1466,-51.5094|PR,GUAIRA,-24.085,-54.2573|PR,GUAIRACA,-22.932,-52.6906|PR,GUAMIRANGA,-25.1912,-50.8021|PR,GUAPIRAMA,-23.5203,-50.0407|PR,GUAPOREMA,-23.3402,-52.7786|PR,GUARACI,-22.9694,-51.6504|PR,GUARANIACU,-25.0968,-52.8755|PR,GUARAPUAVA,-25.3902,-51.4623|PR,GUARATUBA,-25.8817,-48.5752|PR,HONORIO SERPA,-26.139,-52.3848|PR,IBAITI,-23.8478,-50.1932|PR,IBEMA,-25.1193,-53.0072|PR,IBIPORA,-23.2659,-51.0522|PR,ICARAIMA,-23.3944,-53.615|PR,IGUARACU,-23.1949,-51.8256|PR,IGUATU,-24.7153,-53.0827|PR,IMBAU,-24.448,-50.7533|PR,IMBITUVA,-25.2285,-50.5989|PR,INACIO MARTINS,-25.5704,-51.0769|PR,INAJA,-22.7509,-52.1995|PR,IPIRANGA,-25.0238,-50.5794|PR,IPORA,-24.0083,-53.706|PR,IRATI,-25.4697,-50.6493|PR,IRETAMA,-24.4253,-52.1012|PR,ITAGUAJE,-22.6183,-51.9674|PR,ITAIPULANDIA,-25.1366,-54.3001|PR,ITAMBARACA,-23.0181,-50.4097|PR,ITAMBE,-23.6601,-51.9912|PR,ITAPEJARA DO OESTE,-25.9661,-52.8147|PR,ITAPERUCU,-25.2193,-49.3454|PR,IVAI,-25.0067,-50.857|PR,IVAIPORA,-24.2485,-51.6754|PR,IVATE,-23.4072,-53.3687|PR,JABOTI,-23.7435,-50.0729|PR,JACAREZINHO,-23.1591,-49.9739|PR,JAGUAPITA,-23.1104,-51.5342|PR,JAGUARIAIVA,-24.2439,-49.7066|PR,JANDAIA DO SUL,-23.6011,-51.6448|PR,JANIOPOLIS,-24.1401,-52.7784|PR,JAPIRA,-23.8142,-50.1422|PR,JAPURA,-23.4693,-52.5557|PR,JARDIM ALEGRE,-24.1809,-51.6902|PR,JARDIM OLINDA,-22.5523,-52.0503|PR,JATAIZINHO,-23.2578,-50.9777|PR,JESUITAS,-24.3839,-53.3849|PR,JOAQUIM TAVORA,-23.4987,-49.909|PR,JUNDIAI DO SUL,-23.4357,-50.2496|PR,JURANDA,-24.4209,-52.8413|PR,JUSSARA,-23.6219,-52.4693|PR,KALORE,-23.8188,-51.6687|PR,LAPA,-25.7671,-49.7168|PR,LARANJAL,-24.8862,-52.47|PR,LARANJEIRAS DO SUL,-25.4077,-52.4109|PR,LEOPOLIS,-23.0818,-50.7511|PR,LIDIANOPOLIS,-24.11,-51.6506|PR,LINDOESTE,-25.2596,-53.5733|PR,LOANDA,-22.9232,-53.1362|PR,LOBATO,-23.0058,-51.9524|PR,LONDRINA,-23.304,-51.1691|PR,LUIZIANA,-24.2853,-52.269|PR,LUNARDELLI,-24.0821,-51.7368|PR,LUPIONOPOLIS,-22.755,-51.6601|PR,MALLET,-25.8806,-50.8173|PR,MAMBORE,-24.317,-52.5271|PR,MANDAGUACU,-23.3458,-52.0944|PR,MANDAGUARI,-23.5446,-51.671|PR,MANDIRITUBA,-25.777,-49.3282|PR,MANFRINOPOLIS,-26.1441,-53.3113|PR,MANGUEIRINHA,-25.9421,-52.1743|PR,MANOEL RIBAS,-24.5144,-51.6658|PR,MARECHAL CANDIDO RONDON,-24.557,-54.0571|PR,MARIA HELENA,-23.6158,-53.2053|PR,MARIALVA,-23.4843,-51.7928|PR,MARILANDIA DO SUL,-23.7425,-51.3137|PR,MARILENA,-22.7336,-53.0402|PR,MARILUZ,-24.0089,-53.1432|PR,MARINGA,-23.4205,-51.9333|PR,MARIOPOLIS,-26.355,-52.5532|PR,MARIPA,-24.42,-53.8286|PR,MARMELEIRO,-26.1472,-53.0267|PR,MARQUINHO,-25.112,-52.2497|PR,MARUMBI,-23.7058,-51.6404|PR,MATELANDIA,-25.2496,-53.9935|PR,MATINHOS,-25.8237,-48.549|PR,MATO RICO,-24.6995,-52.1454|PR,MAUA DA SERRA,-23.8988,-51.2277|PR,MEDIANEIRA,-25.2977,-54.0943|PR,MERCEDES,-24.4538,-54.1618|PR,MISSAL,-25.0919,-54.2477|PR,MOREIRA SALES,-24.0509,-53.0102|PR,MORRETES,-25.4744,-48.8345|PR,MUNHOZ DE MELLO,-23.1477,-51.7739|PR,NOSSA SENHORA DAS GRACAS,-22.9129,-51.7978|PR,NOVA AMERICA DA COLINA,-23.3308,-50.7168|PR,NOVA AURORA,-24.5289,-53.2575|PR,NOVA CANTU,-24.6723,-52.5661|PR,NOVA ESPERANCA,-23.182,-52.2031|PR,NOVA ESPERANCA DO SUDOESTE,-25.9004,-53.2618|PR,NOVA FATIMA,-23.4324,-50.5665|PR,NOVA LARANJEIRAS,-25.3054,-52.5447|PR,NOVA LONDRINA,-22.7639,-52.9868|PR,NOVA OLIMPIA,-23.4703,-53.0898|PR,NOVA PRATA DO IGUACU,-25.6309,-53.3469|PR,NOVA SANTA BARBARA,-23.5865,-50.7598|PR,NOVA SANTA ROSA,-24.4693,-53.9552|PR,NOVA TEBAS,-24.438,-51.9454|PR,NOVO ITACOLOMI,-23.7631,-51.5079|PR,ORTIGUEIRA,-24.2058,-50.9185|PR,OURIZONA,-23.4053,-52.1964|PR,PAICANDU,-23.4555,-52.046|PR,PALMAS,-26.4839,-51.9888|PR,PALMEIRA,-25.4257,-50.007|PR,PALMITAL,-24.8853,-52.2029|PR,PALOTINA,-24.2868,-53.8404|PR,PARAISO DO NORTE,-23.2824,-52.6054|PR,PARANACITY,-22.9297,-52.1549|PR,PARANAGUA,-25.5161,-48.5225|PR,PARANAPOEMA,-22.6412,-52.0905|PR,PARANAVAI,-23.0816,-52.4617|PR,PATO BRAGADO,-24.6271,-54.2265|PR,PATO BRANCO,-26.2292,-52.6706|PR,PAULA FREITAS,-26.2105,-50.931|PR,PAULO FRONTIN,-26.0466,-50.8304|PR,PEABIRU,-23.914,-52.3431|PR,PEROBAL,-23.8949,-53.4098|PR,PEROLA,-23.8039,-53.6834|PR,PEROLA DO OESTE,-25.759,-53.8055|PR,PIEN,-26.0965,-49.4336|PR,PINHAIS,-25.4429,-49.1927|PR,PINHALAO,-23.7982,-50.0536|PR,PINHAO,-25.6944,-51.6536|PR,PIRAI DO SUL,-24.5306,-49.9433|PR,PIRAQUARA,-25.4422,-49.0624|PR,PITANGA,-24.7588,-51.7596|PR,PITANGUEIRAS,-23.2281,-51.5873|PR,PLANALTINA DO PARANA,-23.0101,-52.9162|PR,PLANALTO,-25.7211,-53.7642|PR,PONTA GROSSA,-25.0916,-50.1668|PR,PONTAL DO PARANA,-25.6735,-48.5111|PR,PORECATU,-22.7537,-51.3795|PR,PORTO AMAZONAS,-25.54,-49.8946|PR,PORTO BARREIRO,-25.5477,-52.4067|PR,PORTO RICO,-22.7747,-53.2677|PR,PORTO VITORIA,-26.1674,-51.231|PR,PRADO FERREIRA,-23.0357,-51.4429|PR,PRANCHITA,-26.0209,-53.7397|PR,PRESIDENTE CASTELO BRANCO,-23.2782,-52.1536|PR,PRIMEIRO DE MAIO,-22.8517,-51.0293|PR,PRUDENTOPOLIS,-25.2111,-50.9754|PR,QUARTO CENTENARIO,-24.2775,-53.0759|PR,QUATIGUA,-23.5671,-49.916|PR,QUATRO BARRAS,-25.3673,-49.0763|PR,QUATRO PONTES,-24.5752,-53.9759|PR,QUEDAS DO IGUACU,-25.4492,-52.9102|PR,QUERENCIA DO NORTE,-23.0838,-53.483|PR,QUINTA DO SOL,-23.8533,-52.1309|PR,QUITANDINHA,-25.8734,-49.4973|PR,RAMILANDIA,-25.1195,-54.023|PR,RANCHO ALEGRE,-23.0676,-50.9145|PR,RANCHO ALEGRE D OESTE,-24.2778,-53.075|PR,REALEZA,-25.7711,-53.526|PR,REBOUCAS,-25.6232,-50.6877|PR,RENASCENCA,-26.1588,-52.9703|PR,RESERVA,-24.6492,-50.8466|PR,RESERVA DO IGUACU,-25.8319,-52.0272|PR,RIBEIRAO CLARO,-23.1941,-49.7597|PR,RIBEIRAO DO PINHAL,-23.4091,-50.3601|PR,RIO AZUL,-25.7306,-50.7985|PR,RIO BOM,-23.7606,-51.4122|PR,RIO BONITO DO IGUACU,-25.4874,-52.5292|PR,RIO BRANCO DO IVAI,-24.3244,-51.3187|PR,RIO BRANCO DO SUL,-25.1892,-49.3115|PR,RIO NEGRO,-26.095,-49.7982|PR,ROLANDIA,-23.3101,-51.3659|PR,RONCADOR,-24.5958,-52.2716|PR,RONDON,-23.412,-52.7659|PR,ROSARIO DO IVAI,-24.2682,-51.272|PR,SABAUDIA,-23.3155,-51.555|PR,SALGADO FILHO,-26.1777,-53.3631|PR,SALTO DO ITARARE,-23.6074,-49.6354|PR,SALTO DO LONTRA,-25.7813,-53.3135|PR,SANTA AMELIA,-23.2654,-50.4288|PR,SANTA CECILIA DO PAVAO,-23.5201,-50.7835|PR,SANTA CRUZ DE MONTE CASTELO,-22.9582,-53.2949|PR,SANTA FE,-23.04,-51.808|PR,SANTA HELENA,-24.8585,-54.336|PR,SANTA ISABEL DO IVAI,-23.0025,-53.1989|PR,SANTA IZABEL DO OESTE,-25.8217,-53.4801|PR,SANTA LUCIA,-25.4104,-53.5638|PR,SANTA MARIA DO OESTE,-24.9377,-51.8696|PR,SANTA MARIANA,-23.1465,-50.5167|PR,SANTA MONICA,-23.108,-53.1103|PR,SANTA TEREZA DO OESTE,-25.0543,-53.6274|PR,SANTA TEREZINHA DE ITAIPU,-25.4391,-54.402|PR,SANTANA DO ITARARE,-23.7587,-49.6293|PR,SANTO ANTONIO DA PLATINA,-23.2959,-50.0815|PR,SANTO ANTONIO DO CAIUA,-22.7351,-52.344|PR,SANTO ANTONIO DO PARAISO,-23.4969,-50.6455|PR,SANTO ANTONIO DO SUDOESTE,-26.0737,-53.7251|PR,SANTO INACIO,-22.6957,-51.7969|PR,SAO CARLOS DO IVAI,-23.3158,-52.4761|PR,SAO JERONIMO DA SERRA,-23.7218,-50.7475|PR,SAO JOAO,-25.8214,-52.7252|PR,SAO JOAO DO CAIUA,-22.8535,-52.3411|PR,SAO JOAO DO IVAI,-23.9833,-51.8215|PR,SAO JOAO DO TRIUNFO,-25.683,-50.2949|PR,SAO JORGE D OESTE,-25.4389,-53.5269|PR,SAO JORGE DO IVAI,-23.4336,-52.2929|PR,SAO JORGE DO PATROCINIO,-23.7647,-53.8823|PR,SAO JOSE DA BOA VISTA,-23.9122,-49.6577|PR,SAO JOSE DOS PINHAIS,-25.5313,-49.2031|PR,SAO MATEUS DO SUL,-25.8677,-50.384|PR,SAO MIGUEL DO IGUACU,-25.3492,-54.2405|PR,SAO PEDRO DO IGUACU,-24.9373,-53.8521|PR,SAO PEDRO DO IVAI,-23.8634,-51.8568|PR,SAO SEBASTIAO DA AMOREIRA,-23.4656,-50.7625|PR,SAPOPEMA,-23.9078,-50.5801|PR,SARANDI,-23.4441,-51.876|PR,SAUDADE DO IGUACU,-25.6917,-52.6184|PR,SENGES,-24.1129,-49.4616|PR,SERRANOPOLIS DO IGUACU,-25.3799,-54.0518|PR,SERTANEJA,-23.0361,-50.8317|PR,SERTANOPOLIS,-23.0571,-51.0399|PR,SIQUEIRA CAMPOS,-23.6875,-49.8304|PR,SULINA,-25.7066,-52.7299|PR,TAMARANA,-23.7204,-51.0991|PR,TAMBOARA,-23.2036,-52.4743|PR,TAPEJARA,-23.7315,-52.8735|PR,TAPIRA,-23.3193,-53.0684|PR,TEIXEIRA SOARES,-25.3701,-50.4571|PR,TELEMACO BORBA,-24.3245,-50.6176|PR,TERRA BOA,-23.7683,-52.447|PR,TERRA RICA,-22.7111,-52.6188|PR,TERRA ROXA,-24.1575,-54.0988|PR,TIBAGI,-24.5153,-50.4176|PR,TIJUCAS DO SUL,-25.9311,-49.195|PR,TOLEDO,-24.7246,-53.7412|PR,TOMAZINA,-23.7796,-49.9499|PR,TRES BARRAS DO PARANA,-25.4185,-53.1833|PR,TUNAS DO PARANA,-24.9731,-49.0879|PR,TUNEIRAS DO OESTE,-23.8648,-52.8769|PR,TUPASSI,-24.5879,-53.5105|PR,TURVO,-25.0437,-51.5282|PR,UBIRATA,-24.5393,-52.9865|PR,UMUARAMA,-23.7656,-53.3201|PR,UNIAO DA VITORIA,-26.2273,-51.0873|PR,UNIFLOR,-23.0868,-52.1573|PR,URAI,-23.2,-50.7939|PR,VENTANIA,-24.2458,-50.2376|PR,VERA CRUZ DO OESTE,-25.0577,-53.8771|PR,VERE,-25.8772,-52.9051|PR,VIRMOND,-25.3829,-52.1987|PR,VITORINO,-26.2683,-52.7843|PR,WENCESLAU BRAZ,-23.8742,-49.8032|PR,XAMBRE,-23.7364,-53.4884|RS,ACEGUA,-31.8665,-54.1615|RS,AGUDO,-29.6447,-53.2515|RS,AJURICABA,-28.2342,-53.7757|RS,ALECRIM,-27.6579,-54.7649|RS,ALEGRETE,-29.7902,-55.7949|RS,ALEGRIA,-27.8345,-54.0557|RS,ALPESTRE,-27.2502,-53.0341|RS,ALTO FELIZ,-29.3919,-51.3123|RS,ALVORADA,-29.9914,-51.0809|RS,AMARAL FERRADOR,-30.8756,-52.2509|RS,AMETISTA DO SUL,-27.3607,-53.183|RS,ANTA GORDA,-28.9698,-52.0102|RS,ANTONIO PRADO,-28.8565,-51.2883|RS,ARAMBARE,-30.9092,-51.5046|RS,ARARICA,-29.6168,-50.9291|RS,ARATIBA,-27.3978,-52.2975|RS,ARROIO DO MEIO,-29.4014,-51.9557|RS,ARROIO DO SAL,-29.5439,-49.8895|RS,ARROIO DO TIGRE,-29.3348,-53.0966|RS,ARROIO DOS RATOS,-30.0875,-51.7275|RS,ARVOREZINHA,-28.8737,-52.1781|RS,AUGUSTO PESTANA,-28.5172,-53.9883|RS,AUREA,-27.6936,-52.0505|RS,BAGE,-31.3297,-54.0999|RS,BALNEARIO PINHAL,-30.2419,-50.2337|RS,BARAO,-29.3725,-51.4949|RS,BARAO DE COTEGIPE,-27.6208,-52.3798|RS,BARAO DO TRIUNFO,-30.3891,-51.7384|RS,BARRA DO GUARITA,-27.1927,-53.7109|RS,BARRA DO QUARAI,-30.2029,-57.5497|RS,BARRA DO RIBEIRO,-30.2939,-51.3014|RS,BARRA FUNDA,-27.9205,-53.0391|RS,BARROS CASSAL,-29.0947,-52.5836|RS,BENTO GONCALVES,-29.1662,-51.5165|RS,BOA VISTA DAS MISSOES,-27.6671,-53.3102|RS,BOA VISTA DO BURICA,-27.6693,-54.1082|RS,BOM PRINCIPIO,-29.4856,-51.3548|RS,BOM RETIRO DO SUL,-29.6071,-51.9456|RS,BOQUEIRAO DO LEAO,-29.3046,-52.4284|RS,BOSSOROCA,-28.7291,-54.9035|RS,BRAGA,-27.6173,-53.7405|RS,BUTIA,-30.1179,-51.9601|RS,CACAPAVA DO SUL,-30.5144,-53.4827|RS,CACEQUI,-29.8883,-54.822|RS,CACHOEIRA DO SUL,-30.033,-52.8928|RS,CACHOEIRINHA,-29.9472,-51.1016|RS,CACIQUE DOBLE,-27.767,-51.6597|RS,CAIBATE,-28.2905,-54.6454|RS,CAICARA,-27.2791,-53.4257|RS,CAMAQUA,-30.8489,-51.8043|RS,CAMARGO,-28.588,-52.2003|RS,CAMBARA DO SUL,-29.0474,-50.1465|RS,CAMPESTRE DA SERRA,-28.7926,-51.0941|RS,CAMPINAS DO SUL,-27.7174,-52.6248|RS,CAMPO BOM,-29.6747,-51.0606|RS,CAMPO NOVO,-27.6792,-53.8052|RS,CAMPOS BORGES,-28.8871,-53.0008|RS,CANDELARIA,-29.6684,-52.7895|RS,CANDIDO GODOI,-27.9515,-54.7517|RS,CANDIOTA,-31.5516,-53.6773|RS,CANELA,-29.356,-50.8119|RS,CANGUCU,-31.396,-52.6783|RS,CANOAS,-29.9128,-51.1857|RS,CAPAO BONITO DO SUL,-28.1254,-51.3961|RS,CAPAO DO LEAO,-31.7565,-52.4889|RS,CAPITAO,-29.2674,-51.9853|RS,CARAA,-29.7869,-50.4316|RS,CARLOS BARBOSA,-29.2969,-51.5028|RS,CATUIPE,-28.2554,-54.0132|RS,CAXIAS DO SUL,-29.1629,-51.1792|RS,CENTENARIO,-27.7615,-51.9984|RS,CERRO BRANCO,-29.657,-52.9406|RS,CERRO GRANDE,-27.6106,-53.1672|RS,CERRO GRANDE DO SUL,-30.5905,-51.7418|RS,CERRO LARGO,-28.1463,-54.7428|RS,CHAPADA,-28.0559,-53.0665|RS,CHARQUEADAS,-29.9625,-51.6289|RS,CHIAPETTA,-27.923,-53.9419|RS,CHUI,-33.6866,-53.4594|RS,CHUVISCA,-30.7504,-51.9737|RS,CIDREIRA,-30.1604,-50.2337|RS,COLORADO,-28.5258,-52.9928|RS,CONDOR,-28.2075,-53.4905|RS,CONSTANTINA,-27.732,-52.9938|RS,COQUEIRO BAIXO,-29.1802,-52.0942|RS,CORONEL BARROS,-28.3921,-54.0686|RS,CORONEL BICACO,-27.7197,-53.7022|RS,COTIPORA,-28.9891,-51.6971|RS,CRISSIUMAL,-27.4999,-54.0994|RS,CRISTAL DO SUL,-27.452,-53.2422|RS,CRUZ ALTA,-28.645,-53.6048|RS,CRUZEIRO DO SUL,-29.5148,-51.9928|RS,DOIS IRMAOS,-29.5836,-51.0898|RS,DOIS IRMAOS DAS MISSOES,-27.6621,-53.5304|RS,DOIS LAJEADOS,-28.983,-51.8396|RS,DOM FELICIANO,-30.7004,-52.1026|RS,DOM PEDRITO,-30.9756,-54.6694|RS,DOM PEDRO DE ALCANTARA,-29.3639,-49.853|RS,DOUTOR MAURICIO CARDOSO,-27.5103,-54.3577|RS,ELDORADO DO SUL,-30.0847,-51.6187|RS,ENCANTADO,-29.2351,-51.8703|RS,ENCRUZILHADA DO SUL,-30.543,-52.5204|RS,ENTRE IJUIS,-28.3686,-54.2686|RS,EREBANGO,-27.8544,-52.3005|RS,ERECHIM,-27.6364,-52.2697|RS,ERNESTINA,-28.4977,-52.5836|RS,ERVAL GRANDE,-27.3926,-52.574|RS,ERVAL SECO,-27.5443,-53.5005|RS,ESPERANCA DO SUL,-27.3603,-53.9891|RS,ESPUMOSO,-28.7286,-52.8461|RS,ESTACAO,-27.9135,-52.2635|RS,ESTANCIA VELHA,-29.6535,-51.1843|RS,ESTEIO,-29.852,-51.1841|RS,ESTRELA,-29.5002,-51.9495|RS,EUGENIO DE CASTRO,-28.5315,-54.1506|RS,FARROUPILHA,-29.2227,-51.3419|RS,FAXINAL DO SOTURNO,-29.5788,-53.4484|RS,FELIZ,-29.4527,-51.3032|RS,FLORES DA CUNHA,-29.0261,-51.1875|RS,FREDERICO WESTPHALEN,-27.3586,-53.3958|RS,GARIBALDI,-29.259,-51.5352|RS,GAURAMA,-27.5856,-52.0915|RS,GENERAL CAMARA,-29.9032,-51.7612|RS,GETULIO VARGAS,-27.8911,-52.2294|RS,GIRUA,-28.0297,-54.3517|RS,GLORINHA,-29.8798,-50.7734|RS,GRAMADO,-29.3734,-50.8762|RS,GRAVATAI,-29.9413,-50.9869|RS,GUABIJU,-28.5421,-51.6948|RS,GUAIBA,-30.1086,-51.3233|RS,GUAPORE,-28.8399,-51.8895|RS,GUARANI DAS MISSOES,-28.1491,-54.5629|RS,HERVEIRAS,-29.4552,-52.6553|RS,HORIZONTINA,-27.6282,-54.3053|RS,HUMAITA,-27.5691,-53.9695|RS,IBIACA,-28.0566,-51.8599|RS,IBIRAPUITA,-28.6247,-52.5158|RS,IBIRUBA,-28.6302,-53.0961|RS,IGREJINHA,-29.5693,-50.7919|RS,IJUI,-28.388,-53.92|RS,ILOPOLIS,-28.9282,-52.1258|RS,IMBE,-29.9753,-50.1281|RS,IMIGRANTE,-29.3508,-51.7748|RS,INDEPENDENCIA,-27.8354,-54.1886|RS,IPIRANGA DO SUL,-27.9404,-52.4271|RS,IRAI,-27.1951,-53.2543|RS,ITAQUI,-29.1311,-56.5515|RS,ITATI,-29.4974,-50.1016|RS,ITATIBA DO SUL,-27.3846,-52.4538|RS,IVOTI,-29.5995,-51.1533|RS,JABOTICABA,-27.6347,-53.2762|RS,JACUTINGA,-27.7291,-52.5372|RS,JAGUARAO,-32.5604,-53.377|RS,JAGUARI,-29.4936,-54.703|RS,JAQUIRANA,-28.8811,-50.3637|RS,JOIA,-28.6435,-54.1141|RS,JULIO DE CASTILHOS,-29.2299,-53.6772|RS,LAGOA VERMELHA,-28.2093,-51.5248|RS,LAGOAO,-29.2348,-52.7997|RS,LAJEADO,-29.4591,-51.9644|RS,LAJEADO DO BUGRE,-27.6913,-53.1818|RS,LAVRAS DO SUL,-30.8071,-53.8931|RS,LINDOLFO COLLOR,-29.5859,-51.2141|RS,LINHA NOVA,-29.4679,-51.2003|RS,MACAMBARA,-29.1445,-56.0674|RS,MACHADINHO,-27.5667,-51.6668|RS,MAMPITUBA,-29.2136,-49.9311|RS,MANOEL VIANA,-29.5859,-55.4841|RS,MAQUINE,-29.6798,-50.2079|RS,MARAU,-28.4498,-52.1986|RS,MARCELINO RAMOS,-27.4676,-51.9095|RS,MARIANA PIMENTEL,-30.353,-51.5803|RS,MARIANO MORO,-27.3568,-52.1467|RS,MARQUES DE SOUZA,-29.3311,-52.0973|RS,MATO LEITAO,-29.5285,-52.1278|RS,MAXIMILIANO DE ALMEIDA,-27.6325,-51.802|RS,MINAS DO LEAO,-30.1346,-52.0423|RS,MIRAGUAI,-27.497,-53.6891|RS,MONTENEGRO,-29.6824,-51.4679|RS,MORRO REUTER,-29.5379,-51.0811|RS,MOSTARDAS,-31.1054,-50.9167|RS,MUCUM,-29.163,-51.8714|RS,NAO ME TOQUE,-28.4548,-52.8182|RS,NONOAI,-27.3689,-52.7756|RS,NOVA ALVORADA,-28.6822,-52.1631|RS,NOVA BASSANO,-28.7291,-51.7072|RS,NOVA BOA VISTA,-27.9926,-52.9784|RS,NOVA BRESCIA,-29.2182,-52.0319|RS,NOVA CANDELARIA,-27.6137,-54.1074|RS,NOVA ESPERANCA DO SUL,-29.4066,-54.8293|RS,NOVA HARTZ,-29.5808,-50.9051|RS,NOVA PALMA,-29.471,-53.4689|RS,NOVA PETROPOLIS,-29.3741,-51.1136|RS,NOVA PRATA,-28.7799,-51.6113|RS,NOVA ROMA DO SUL,-28.9882,-51.4095|RS,NOVA SANTA RITA,-29.8525,-51.2837|RS,NOVO BARREIRO,-27.9077,-53.1103|RS,NOVO CABRAIS,-29.7338,-52.9489|RS,NOVO HAMBURGO,-29.6875,-51.1328|RS,NOVO TIRADENTES,-27.5649,-53.1837|RS,OSORIO,-29.8881,-50.2667|RS,PALMARES DO SUL,-30.2535,-50.5103|RS,PALMEIRA DAS MISSOES,-27.9007,-53.3134|RS,PALMITINHO,-27.3596,-53.558|RS,PANAMBI,-28.2833,-53.5023|RS,PANTANO GRANDE,-30.1902,-52.3729|RS,PARAI,-28.5964,-51.7896|RS,PARAISO DO SUL,-29.6717,-53.144|RS,PAROBE,-29.6243,-50.8312|RS,PASSO DO SOBRADO,-29.748,-52.2748|RS,PASSO FUNDO,-28.2576,-52.4091|RS,PAVERAMA,-29.5486,-51.7339|RS,PEDRO OSORIO,-31.8642,-52.8184|RS,PEJUCARA,-28.4283,-53.6579|RS,PELOTAS,-31.7649,-52.3371|RS,PICADA CAFE,-29.4464,-51.1367|RS,PINHAL,-27.508,-53.2082|RS,PINHEIRO MACHADO,-31.5794,-53.3798|RS,PINTO BANDEIRA,-29.0975,-51.4503|RS,PIRATINI,-31.4473,-53.0973|RS,PLANALTO,-27.3297,-53.0575|RS,POCO DAS ANTAS,-29.4481,-51.6719|RS,PORTAO,-29.7015,-51.2429|RS,PORTO ALEGRE,-30.0318,-51.2065|RS,PORTO LUCENA,-27.8569,-55.01|RS,PORTO MAUA,-27.5796,-54.6657|RS,PORTO XAVIER,-27.9082,-55.1379|RS,PRESIDENTE LUCENA,-29.5175,-51.1798|RS,PUTINGA,-29.0045,-52.1569|RS,QUARAI,-30.384,-56.4483|RS,QUINZE DE NOVEMBRO,-28.7466,-53.1011|RS,REDENTORA,-27.664,-53.6407|RS,RELVADO,-29.1164,-52.0778|RS,RESTINGA SECA,-29.8188,-53.3807|RS,RIO DOS INDIOS,-27.2973,-52.8417|RS,RIO GRANDE,-32.0349,-52.1071|RS,RIO PARDO,-29.988,-52.3711|RS,RIOZINHO,-29.639,-50.4488|RS,RODEIO BONITO,-27.4742,-53.1706|RS,ROLANTE,-29.6462,-50.5819|RS,RONDA ALTA,-27.7758,-52.8056|RS,ROQUE GONZALES,-28.1297,-55.0266|RS,ROSARIO DO SUL,-30.2515,-54.9221|RS,SAGRADA FAMILIA,-27.7085,-53.1351|RS,SALDANHA MARINHO,-28.3941,-53.097|RS,SALTO DO JACUI,-29.0951,-53.2133|RS,SALVADOR DAS MISSOES,-28.1233,-54.8373|RS,SALVADOR DO SUL,-29.4386,-51.5077|RS,SANANDUVA,-27.947,-51.8079|RS,SANTA BARBARA DO SUL,-28.3653,-53.251|RS,SANTA CLARA DO SUL,-29.4747,-52.0843|RS,SANTA CRUZ DO SUL,-29.722,-52.4343|RS,SANTA MARIA,-29.6868,-53.8149|RS,SANTA MARIA DO HERVAL,-29.4902,-50.9919|RS,SANTA ROSA,-27.8702,-54.4796|RS,SANTA VITORIA DO PALMAR,-33.525,-53.3717|RS,SANTANA DA BOA VISTA,-30.8697,-53.11|RS,SANTANA DO LIVRAMENTO,-30.8773,-55.5392|RS,SANTIAGO,-29.1897,-54.8666|RS,SANTO ANGELO,-28.3001,-54.2668|RS,SANTO ANTONIO DA PATRULHA,-29.8268,-50.5175|RS,SANTO ANTONIO DAS MISSOES,-28.514,-55.2251|RS,SANTO ANTONIO DO PLANALTO,-28.403,-52.6992|RS,SANTO AUGUSTO,-27.8526,-53.7776|RS,SANTO CRISTO,-27.8263,-54.662|RS,SAO BORJA,-28.6578,-56.0036|RS,SAO FRANCISCO DE ASSIS,-29.5547,-55.1253|RS,SAO FRANCISCO DE PAULA,-29.4404,-50.5828|RS,SAO GABRIEL,-30.3337,-54.3217|RS,SAO JERONIMO,-29.9716,-51.7251|RS,SAO JOAO DA URTIGA,-27.8195,-51.8257|RS,SAO JOAO DO POLESINE,-29.6194,-53.4439|RS,SAO JORGE,-28.4984,-51.7064|RS,SAO JOSE DAS MISSOES,-27.7789,-53.1226|RS,SAO JOSE DO HERVAL,-29.052,-52.295|RS,SAO JOSE DO HORTENCIO,-29.528,-51.245|RS,SAO JOSE DO INHACORA,-27.7251,-54.1275|RS,SAO JOSE DO NORTE,-32.0151,-52.0331|RS,SAO JOSE DO OURO,-27.7707,-51.5966|RS,SAO LEOPOLDO,-29.7545,-51.1498|RS,SAO LOURENCO DO SUL,-31.3564,-51.9715|RS,SAO LUIZ GONZAGA,-28.412,-54.9559|RS,SAO MARCOS,-28.9677,-51.0696|RS,SAO MARTINHO,-27.7112,-53.9699|RS,SAO MIGUEL DAS MISSOES,-28.556,-54.5559|RS,SAO NICOLAU,-28.1834,-55.2654|RS,SAO PEDRO DA SERRA,-29.4193,-51.5134|RS,SAO PEDRO DAS MISSOES,-27.7706,-53.2513|RS,SAO PEDRO DO BUTIA,-28.1243,-54.8926|RS,SAO PEDRO DO SUL,-29.6202,-54.1855|RS,SAO SEPE,-30.1643,-53.5603|RS,SAO VENDELINO,-29.3729,-51.3675|RS,SAPIRANGA,-29.6349,-51.0064|RS,SAPUCAIA DO SUL,-29.8276,-51.145|RS,SARANDI,-27.942,-52.9231|RS,SEBERI,-27.4829,-53.4026|RS,SEDE NOVA,-27.6367,-53.9493|RS,SELBACH,-28.6294,-52.9498|RS,SENTINELA DO SUL,-30.6107,-51.5862|RS,SERAFINA CORREA,-28.7126,-51.9352|RS,SERTAO,-27.9798,-52.2588|RS,SERTAO DE SANTANA,-30.4958,-51.5833|RS,SERTAO SANTANA,-30.4562,-51.6017|RS,SEVERIANO DE ALMEIDA,-27.4362,-52.1217|RS,SINIMBU,-29.5357,-52.5304|RS,SOLEDADE,-28.8306,-52.5131|RS,TAPEJARA,-28.0652,-52.0097|RS,TAPERA,-28.6277,-52.8613|RS,TAPES,-30.6683,-51.3991|RS,TAQUARA,-29.6505,-50.7753|RS,TAQUARI,-29.7943,-51.8653|RS,TAQUARUCU DO SUL,-27.4005,-53.4702|RS,TAVARES,-31.2843,-51.088|RS,TENENTE PORTELA,-27.3711,-53.7585|RS,TERRA DE AREIA,-29.5788,-50.0644|RS,TEUTONIA,-29.4482,-51.8044|RS,TIO HUGO,-28.5712,-52.5955|RS,TIRADENTES DO SUL,-27.4022,-54.0814|RS,TORRES,-29.3334,-49.7333|RS,TRAMANDAI,-29.9841,-50.1322|RS,TRAVESSEIRO,-29.2977,-52.0532|RS,TRES CACHOEIRAS,-29.4487,-49.9275|RS,TRES COROAS,-29.5137,-50.7739|RS,TRES DE MAIO,-27.78,-54.2357|RS,TRES PASSOS,-27.4555,-53.9296|RS,TRINDADE DO SUL,-27.5239,-52.8956|RS,TRIUNFO,-29.9291,-51.7075|RS,TUCUNDUVA,-27.6573,-54.4439|RS,TUPANCIRETA,-29.0858,-53.8445|RS,TUPANDI,-29.4772,-51.4174|RS,TUPARENDI,-27.7598,-54.4814|RS,UNISTALDA,-29.04,-55.1517|RS,URUGUAIANA,-29.7614,-57.0853|RS,VACARIA,-28.5079,-50.9418|RS,VALE REAL,-29.3919,-51.2559|RS,VALE VERDE,-29.7864,-52.1857|RS,VANINI,-28.4758,-51.8447|RS,VENANCIO AIRES,-29.6143,-52.1932|RS,VERA CRUZ,-29.7184,-52.5152|RS,VERANOPOLIS,-28.9312,-51.5516|RS,VIADUTOS,-27.5716,-52.0211|RS,VIAMAO,-30.0819,-51.0194|RS,VICENTE DUTRA,-27.1607,-53.4022|RS,VILA FLORES,-28.8598,-51.5504|RS,VILA MARIA,-28.5359,-52.1486|RS,VILA NOVA DO SUL,-30.3461,-53.876|RS,VISTA ALEGRE,-27.3686,-53.4919|RS,VISTA GAUCHA,-27.2902,-53.6974|RS,VITORIA DAS MISSOES,-28.3516,-54.504|SC,ABDON BATISTA,-27.6126,-51.0233|SC,ABELARDO LUZ,-26.5716,-52.3229|SC,AGROLANDIA,-27.4087,-49.822|SC,AGRONOMICA,-27.2662,-49.708|SC,AGUAS DE CHAPECO,-27.0754,-52.9808|SC,ALFREDO WAGNER,-27.7001,-49.3273|SC,ANTONIO CARLOS,-27.5191,-48.766|SC,APIUNA,-27.0375,-49.3885|SC,ARABUTA,-27.1587,-52.1423|SC,ARAQUARI,-26.3754,-48.7188|SC,ARARANGUA,-28.9356,-49.4918|SC,ARMAZEM,-28.2448,-49.0215|SC,ASCURRA,-26.9548,-49.3783|SC,BALNEARIO BARRA DO SUL,-26.4597,-48.6123|SC,BALNEARIO CAMBORIU,-26.9926,-48.6352|SC,BALNEARIO GAIVOTAS,-29.155,-49.566|SC,BALNEARIO PICARRAS,-26.7639,-48.6717|SC,BARRA DO SUL,-26.4433,-48.6094|SC,BARRA VELHA,-26.637,-48.6933|SC,BELA VISTA DO TOLDO,-26.2746,-50.4664|SC,BIGUACU,-27.496,-48.6598|SC,BLUMENAU,-26.9155,-49.0709|SC,BOM RETIRO,-27.799,-49.487|SC,BOMBINHAS,-27.1382,-48.5146|SC,BOTUVERA,-27.2007,-49.0689|SC,BRACO DO NORTE,-28.2681,-49.1701|SC,BRUSQUE,-27.0977,-48.9107|SC,CACADOR,-26.7757,-51.012|SC,CAMBORIU,-27.0241,-48.6503|SC,CAMPO ALEGRE,-26.195,-49.2676|SC,CAMPO BELO DO SUL,-27.8975,-50.7595|SC,CAMPO ERE,-26.3931,-53.0856|SC,CAMPOS NOVOS,-27.4002,-51.2276|SC,CANELINHA,-27.2616,-48.7658|SC,CANOINHAS,-26.1766,-50.395|SC,CAPIVARI DE BAIXO,-28.4498,-48.9631|SC,CATANDUVAS,-27.069,-51.6602|SC,CERRO NEGRO,-27.7942,-50.8673|SC,CHAPECO,-27.1004,-52.6152|SC,COCAL DO SUL,-28.5986,-49.3335|SC,CONCORDIA,-27.2335,-52.026|SC,CORDILHEIRA ALTA,-26.9844,-52.6056|SC,CORONEL FREITAS,-26.9057,-52.7011|SC,CORONEL MARTINS,-26.511,-52.6694|SC,CORUPA,-26.4246,-49.246|SC,CRICIUMA,-28.6723,-49.3729|SC,CURITIBANOS,-27.2824,-50.5816|SC,DIONISIO CERQUEIRA,-26.2648,-53.6351|SC,DONA EMA,-27.205,-49.8869|SC,FLORIANOPOLIS,-27.5945,-48.5477|SC,FORQUILHINHA,-28.7454,-49.4785|SC,FRAIBURGO,-27.0233,-50.92|SC,GALVAO,-26.4549,-52.6875|SC,GAROPABA,-28.0275,-48.6192|SC,GARUVA,-26.0292,-48.852|SC,GASPAR,-26.9336,-48.9534|SC,GOV CELSO RAMOS,-27.3236,-48.5672|SC,GOVERNADOR CELSO RAMOS,-27.3172,-48.5576|SC,GRAO PARA,-28.1809,-49.2252|SC,GUABIRUBA,-27.0808,-48.9804|SC,GUARACIABA,-26.6042,-53.5243|SC,GUARAMIRIM,-26.4688,-49.0026|SC,ICARA,-28.7132,-49.3087|SC,ILHOTA,-26.9023,-48.8251|SC,IMBITUBA,-28.2284,-48.6659|SC,IMBUIA,-27.4908,-49.4218|SC,INDAIAL,-26.8992,-49.2354|SC,IPORA DO OESTE,-26.9854,-53.5355|SC,IRINEOPOLIS,-26.242,-50.7957|SC,ITAIOPOLIS,-26.339,-49.9092|SC,ITAJAI,-26.9101,-48.6705|SC,ITAPEMA,-27.0861,-48.616|SC,ITAPIRANGA,-27.1659,-53.7166|SC,ITAPOA,-26.1158,-48.6182|SC,ITUPORANGA,-27.4101,-49.5963|SC,JACINTO MACHADO,-28.9961,-49.7623|SC,JAGUARUNA,-28.6146,-49.0296|SC,JARAGUA DO SUL,-26.4851,-49.0713|SC,JARDINOPOLIS,-26.7191,-52.8625|SC,JOACABA,-27.1721,-51.5108|SC,JOINVILLE,-26.3045,-48.8487|SC,JOSE BOITEAUX,-26.9239,-49.8839|SC,LAGES,-27.815,-50.3259|SC,LAGUNA,-28.4843,-48.7772|SC,LAURO MULLER,-28.3859,-49.4035|SC,LEOBERTO LEAL,-27.5081,-49.2789|SC,LONTRAS,-27.1684,-49.535|SC,LUIS ALVES,-26.7767,-48.9767|SC,MAFRA,-26.1159,-49.8086|SC,MARACAJA,-28.8463,-49.4605|SC,MARAVILHA,-26.7665,-53.1737|SC,MASSARANDUBA,-26.6109,-49.0054|SC,MONDAI,-27.1008,-53.4032|SC,MONTE CARLO,-27.2239,-50.9808|SC,MONTE CASTELO,-26.461,-50.2327|SC,MORRO DA FUMACA,-28.6511,-49.2169|SC,NAVEGANTES,-26.8943,-48.6546|SC,NOVA TRENTO,-27.278,-48.9298|SC,NOVA VENEZA,-28.6338,-49.5055|SC,ORLEANS,-28.3487,-49.2986|SC,OTACILIO COSTA,-27.4789,-50.1231|SC,PAIAL,-27.2541,-52.4975|SC,PALHOCA,-27.6455,-48.6697|SC,PALMITOS,-27.0702,-53.1586|SC,PAPANDUVA,-26.3777,-50.1419|SC,PASSO DE TORRES,-29.3099,-49.722|SC,PEDRAS GRANDES,-28.4339,-49.1949|SC,PENHA,-26.7754,-48.6465|SC,PERITIBA,-27.3754,-51.9018|SC,PINHALZINHO,-26.8495,-52.9913|SC,PIRATUBA,-27.4242,-51.7668|SC,PLANALTO ALEGRE,-27.0704,-52.867|SC,POMERODE,-26.7384,-49.1785|SC,PORTO BELO,-27.1586,-48.5469|SC,PORTO UNIAO,-26.2451,-51.0759|SC,POUSO REDONDO,-27.2567,-49.9301|SC,PRAIA GRANDE,-29.1918,-49.9525|SC,PRESIDENTE GETULIO,-27.0474,-49.6246|SC,QUILOMBO,-26.7264,-52.724|SC,RIO DO CAMPO,-26.9452,-50.136|SC,RIO DO OESTE,-27.1952,-49.7989|SC,RIO DO SUL,-27.2156,-49.643|SC,RIO FORTUNA,-28.1244,-49.1068|SC,RIO NEGRINHO,-26.2591,-49.5177|SC,SALETE,-26.9798,-49.9988|SC,SALTO VELOSO,-26.903,-51.4043|SC,SANTA CECILIA,-26.9592,-50.4252|SC,SANTA ROSA DO SUL,-29.1313,-49.7109|SC,SANTA TEREZINHA,-26.7813,-50.009|SC,SANTO AMARO IMPERATRIZ,-27.6769,-48.7658|SC,SAO BENTO DO SUL,-26.2495,-49.3831|SC,SAO CARLOS,-27.0798,-53.0037|SC,SAO FRANCISCO DO SUL,-26.2579,-48.6344|SC,SAO JOAO BATISTA,-27.2772,-48.8474|SC,SAO JOAO DO OESTE,-27.0984,-53.5977|SC,SAO JOAO DO SUL,-29.2154,-49.8094|SC,SAO JOAQUIM,-28.2887,-49.9457|SC,SAO JOSE,-27.6136,-48.6366|SC,SAO LOURENCO DO OESTE,-26.3557,-52.8498|SC,SAO LUDGERO,-28.3144,-49.1806|SC,SAO MARTINHO,-28.1609,-48.9867|SC,SAO MIGUEL DO OESTE,-26.7242,-53.5163|SC,SAUDADES,-26.9317,-53.0021|SC,SCHROEDER,-26.4116,-49.074|SC,SEARA,-27.1564,-52.299|SC,SIDEROPOLIS,-28.5955,-49.4314|SC,SOMBRIO,-29.108,-49.6328|SC,SUL BRASIL,-26.7351,-52.964|SC,TAIO,-27.121,-49.9942|SC,TIJUCAS,-27.2354,-48.6322|SC,TIMBE DO SUL,-28.8287,-49.842|SC,TIMBO,-26.8246,-49.269|SC,TRES BARRAS,-26.1056,-50.3197|SC,TROMBUDO CENTRAL,-27.3033,-49.793|SC,TUBARAO,-28.4713,-49.0144|SC,TURVO,-28.9272,-49.6831|SC,URUSSANGA,-28.518,-49.3238|SC,VARGEAO,-26.8621,-52.1549|SC,VIDEIRA,-27.0086,-51.1543|SC,WITMARSUM,-26.9275,-49.7947|SC,XANXERE,-26.8747,-52.4036|SC,XAXIM,-26.9596,-52.5374|SP,AGUAS DE LINDOIA,-22.4733,-46.6314|SP,AMERICANA,-22.7374,-47.3331|SP,ARACATUBA,-21.2076,-50.4401|SP,ARARAS,-22.3572,-47.3842|SP,ARUJA,-23.3965,-46.32|SP,AVARE,-23.1067,-48.9251|SP,BANANAL,-22.6819,-44.3281|SP,BERTIOGA,-23.8486,-46.1396|SP,BOTUCATU,-22.8837,-48.4437|SP,BRODOWSKI,-20.9845,-47.6572|SP,CACHOEIRA PAULISTA,-22.6665,-45.0154|SP,CAMPINAS,-22.9053,-47.0659|SP,CAMPO LIMPO PAULISTA,-23.2078,-46.7889|SP,CARAPICUIBA,-23.5235,-46.8407|SP,CARDOSO,-20.08,-49.9183|SP,CRAVINHOS,-21.338,-47.7324|SP,GUARUJA,-23.9888,-46.258|SP,GUARULHOS,-23.4538,-46.5333|SP,IBIUNA,-23.6596,-47.223|SP,IRAPURU,-21.5684,-51.3472|SP,ITANHAEM,-24.1736,-46.788|SP,JACAREI,-23.2983,-45.9658|SP,JAU,-22.2936,-48.5592|SP,JUNDIAI,-23.1852,-46.8974|SP,LINDOIA,-22.5226,-46.65|SP,MATAO,-21.6025,-48.364|SP,MOGI DAS CRUZES,-23.5208,-46.1854|SP,MONTE ALEGRE DO SUL,-22.6817,-46.681|SP,MORRO AGUDO,-20.7288,-48.0581|SP,ORLANDIA,-20.7169,-47.8852|SP,PALMITAL,-22.7858,-50.218|SP,PIRASSUNUNGA,-21.996,-47.4257|SP,PRADOPOLIS,-21.3626,-48.0679|SP,PRAIA GRANDE,-24.0084,-46.4121|SP,RIBEIRAO PIRES,-23.7067,-46.4058|SP,RIBEIRAO PRETO,-21.1699,-47.8099|SP,SANTA ADELIA,-21.2427,-48.8063|SP,SANTA BARBARA DOESTE,-22.7553,-47.4143|SP,SANTOS,-23.9535,-46.335|SP,SAO JOSE DO BARREIRO,-22.6414,-44.5774|SP,SAO JOSE DO RIO PRETO,-20.8113,-49.3758|SP,SAO JOSE DOS CAMPOS,-23.1896,-45.8841|SP,SAO PAULO,-23.5329,-46.6395|SP,SAO VICENTE,-23.9574,-46.3883|SP,SERRA AZUL,-21.3074,-47.5602|SP,SERRA NEGRA,-22.6139,-46.7033|SP,SERTAOZINHO,-21.1316,-47.9875|SP,SOROCABA,-23.4969,-47.4451|SP,SUZANO,-23.5448,-46.3112|SP,TABOAO DA SERRA,-23.6019,-46.7526`;

let cityCoordsCache: Record<string, [number, number]> | null = null;

const getCityCoords = (city: string, state: string): [number, number] | undefined => {
    if (!cityCoordsCache) {
        cityCoordsCache = {};
        // Populate from CSV
        const rows = RAW_CITIES_CSV.split('|');
        rows.forEach(row => {
            const [uf, name, lat, lng] = row.split(',');
            // Key format: CITYNAME-UF
            const key = `${name.toUpperCase().trim()}-${uf.toUpperCase().trim()}`;
            cityCoordsCache![key] = [parseFloat(lat), parseFloat(lng)];
        });
    }

    // Clean and Normalize Input
    const cleanCity = city.toUpperCase().trim()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/-.*/, '').replace(/\/.*/, '').trim(); // Remove existing state suffix if any in city name

    const cleanState = state.toUpperCase().trim();

    // 1. Try Exact Match CITY-STATE
    if (cleanState) {
        const key = `${cleanCity}-${cleanState}`;
        if (cityCoordsCache[key]) return cityCoordsCache[key];
    }

    // 2. Fallback: Try just CITY name if unique enough (or first match)
    // This helps if State column is missing or empty
    if (!cleanState || cleanState === '') {
        const possibleKey = Object.keys(cityCoordsCache).find(k => k.startsWith(`${cleanCity}-`));
        if (possibleKey) return cityCoordsCache[possibleKey];
    }

    return undefined;
};

export const getGeoStats = (data: SaleRecord[]): GeoStats[] => {
    const cityStats: Record<string, GeoStats> = {};

    data.forEach(r => {
        if (!r.city) return; // Strict: Must have city column

        const coords = getCityCoords(r.city, r.state || '');
        
        if (coords) {
            const state = r.state || 'BR';
            const finalCityName = r.city.toUpperCase().split('-')[0].trim();
            const key = `${finalCityName}-${state}`;
            
            if (!cityStats[key]) {
                cityStats[key] = {
                    city: finalCityName,
                    state: state,
                    lat: coords[0],
                    lng: coords[1],
                    revenue: 0,
                    positivacao: 0
                };
            }
            // Revenue handles itself (amount is negative for DV)
            const val = r.amount;
            cityStats[key].revenue += val;
            if (val > 0) cityStats[key].positivacao += 1;
        }
    });

    return Object.values(cityStats).sort((a,b) => b.revenue - a.revenue);
};