export enum Channel {
  RC = 'RC',   // Representante Comercial
  WEB = 'WEB', // Vendas pelo Site
  VD = 'VD',   // Venda Direta
  TV = 'TV'    // Televendas
}

export interface SaleRecord {
  id: string;
  date: string; // Coluna B (Data NFE)
  region: string; // Coluna I
  division: string; // Coluna H
  sector: string; // Coluna J
  salesRep: string; // Coluna: Representante
  channel: Channel; // Coluna C
  supplier: string; // Fornecedor
  cnpj: string; // Coluna E
  companyName: string; // Razão Social
  productCode: string; // Coluna S (implied/Code)
  productDesc: string; // Descrição
  amount: number; // Coluna L (Valor)
  quantity: number; // Quantidade
  orderId: string; // Coluna K (Num Pedido)
  operClass: 'VD' | 'DV'; // Classe Oper. (Venda ou Devolução)
  paymentTerms: string; // Coluna U (Prazos ex: 30-60-90)
  networkName: string; // Nome Rede
  city?: string; // Coluna Cidade
  state?: string; // Coluna UF
}

export interface FilterState {
  division: string[];
  region: string[];
  sector: string[];
  salesRep: string[];
  channel: string[];
  supplier: string[];
  startMonth: string;
  endMonth: string;
}

export interface KPIStats {
  totalRevenue: number;
  positivacao: number; // Active clients
  totalOrders: number;
  averageTicket: number;
  skuPerPdv: number;
  avgInstallments: number; // Parcela Média
  avgTerm: number; // Prazo Médio (dias)
}

export interface ChartDataPoint {
  name: string;
  value: number;
  [key: string]: any;
}

export interface MonthlyMetric {
  name: string; // "Ago", "Set", etc.
  sortKey: string; // "2025-08" for sorting
  revenue: number;
  positivacao: number;
  ticketMedio: number;
  skuPdv: number;
}

// Interface for Detailed Table Rows
export interface EntityStats {
  id: string; // CNPJ or Network Name
  name: string;
  revenue: number; // Total Revenue (filtered period) - Kept for compatibility
  
  // New props for Current vs Average comparison
  currentRevenue: number; // Nov
  averagePastRevenue: number; // (Ago+Set+Out)/3
  revenueTrend: number; // % change

  skuPerPdv: number;
  orders: number;
  avgTicket: number;
  avgInstallments: number;
  avgTerm: number;
  region?: string;
  sector?: string;
}

export interface SupplierStats extends EntityStats {
    skuCount: number;
}

export interface ProductStats {
  code: string;
  desc: string;
  revenue: number;
  quantity: number;
  supplier: string;
  division: string;
  clientCount: number;
  orderCount: number;
}

export interface TopItem {
  id: string;
  name: string;
  value: number;
  subValue: number;
}

export interface GeoStats {
  city: string;
  state: string;
  lat: number;
  lng: number;
  revenue: number;
  positivacao: number;
}