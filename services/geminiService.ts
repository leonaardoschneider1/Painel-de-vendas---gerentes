import { GoogleGenAI } from "@google/genai";
import { KPIStats, FilterState, TopItem, EntityStats } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateStrategicInsights = async (
  currentKpis: KPIStats,
  avgKpis: KPIStats,
  filters: FilterState,
  topClients: TopItem[],
  topProducts: TopItem[],
  topReps: TopItem[]
): Promise<string> => {
  
  // Helper para formatar moeda e percentual
  const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  const fmtDec = (v: number) => v.toFixed(2);
  const diff = (curr: number, avg: number) => {
      if (avg === 0) return 0;
      return ((curr - avg) / avg) * 100;
  };

  const revDiff = diff(currentKpis.totalRevenue, avgKpis.totalRevenue);
  const posDiff = diff(currentKpis.positivacao, avgKpis.positivacao);
  const skuDiff = diff(currentKpis.skuPerPdv, avgKpis.skuPerPdv);
  const termDiff = diff(currentKpis.avgTerm, avgKpis.avgTerm);

  // Construct a prompt context
  const context = `
    ATUE COMO: Consultor de Inteligência Comercial (O "Segundo Cérebro" do Gerente de Vendas).
    OBJETIVO: Analisar racionalmente os dados de NOVEMBRO vs MÉDIA (Ago-Out) para encontrar correlações e oportunidades de mix.
    TOM DE VOZ: Analítico, Racional, Colaborativo e Estratégico. Baseado em dados.
    SAZONALIDADE ATUAL: Novembro/Brasil (Pré-Verão, Esquenta Black Friday, Preparação Final de Ano).
    
    CONTEXTO DE SAZONALIDADE (Novembro/Verão):
    - Aumento de atividade física (Dor muscular, contusões).
    - Cuidados com a pele/Sol (Protetores, Pós-sol, Hidratantes).
    - Festas/Confraternizações (Digestivos, Hepatoprotetores, Ressaca).
    - Estética e Vitaminas (Projeto Verão).

    DADOS COMPARATIVOS (NOVEMBRO vs MÉDIA):

    1. FATURAMENTO:
       - Atual: R$ ${fmt(currentKpis.totalRevenue)} (Var: ${revDiff > 0 ? '+' : ''}${revDiff.toFixed(1)}%)
    
    2. POSITIVAÇÃO (Cobertura):
       - Atual: ${currentKpis.positivacao} clientes (Var: ${posDiff > 0 ? '+' : ''}${posDiff.toFixed(1)}%)

    3. PROFUNDIDADE (SKU x PDV):
       - Atual: ${fmtDec(currentKpis.skuPerPdv)} itens dist. (Var: ${skuDiff > 0 ? '+' : ''}${skuDiff.toFixed(1)}%)

    4. FINANCEIRO (Prazo Médio):
       - Atual: ${currentKpis.avgTerm.toFixed(0)} dias (Var: ${termDiff > 0 ? '+' : ''}${termDiff.toFixed(1)}%)

    TOP 5 PRODUTOS MAIS VENDIDOS NO PERÍODO (Para análise de Mix):
    ${topProducts.slice(0, 5).map(p => `- ${p.name} (R$ ${fmt(p.value)})`).join('\n')}

    TOP REPRESENTANTES (Para análise de perfil):
    ${topReps.slice(0, 3).map(r => `- ${r.name}: R$ ${fmt(r.value)}`).join('\n')}

    FILTROS APLICADOS:
    - Região: ${filters.region.join(', ') || 'Nacional'}
    - Canal: ${filters.channel.join(', ') || 'Geral'}

    ---
    
    GERE UM RELATÓRIO DE INTELIGÊNCIA ESTRUTURADO ASSIM:

    ### 🧠 CORRELAÇÃO DE INDICADORES
    (Analise a relação entre Positivação vs SKU x PDV vs Ticket Médio.
    Exemplo de Racional: "Notamos uma queda na Positivação (-X%), porém um aumento no SKU x PDV. Isso indica que a equipe está focando em fidelizar e vender mais mix para os mesmos clientes (Perfil Consultor), ao invés de abrir novos pontos (Perfil Tirador de Pedido).")
    *Cruze os dados acima para validar essa hipótese.*

    ### 🌞 OPORTUNIDADES DE MIX (SAZONALIDADE NOVEMBRO)
    (Olhe para os "Top Produtos" listados acima. Baseado neles e na época do ano (Verão/Festas), o que está faltando?
    Ex: "O produto X está vendendo bem. Para aumentar o ticket, sugiro ofertar Y e Z que são complementares para a categoria [Dor/Pele/Gastro/Vitamina].")

    ### 🔍 HIPÓTESES ESTRATÉGICAS
    (Levante perguntas para o gerente refletir, não ordens.
    Ex: "Considerando que o Rep X tem alto Mix mas baixa cobertura, faria sentido replicar a abordagem técnica dele para a equipe, ou precisamos de uma campanha de reativação de inativos?")

    ### 🚀 SUGESTÕES TÁTICAS
    (2 ou 3 ações pontuais de mix ou foco comercial baseadas nos dados. Ex: "Campanha de 'Kit Verão' focando nos itens X e Y para recuperar a positivação.")

    Mantenha o texto analítico e focado em gerar valor intelectual para a tomada de decisão.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: context,
      config: {
        thinkingConfig: { thinkingBudget: 0 }
      }
    });

    return response.text || "Analisando dados para gerar insights...";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "⚠️ Assistente offline. Verifique conexão.";
  }
};