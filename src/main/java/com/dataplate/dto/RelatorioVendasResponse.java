package com.dataplate.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record RelatorioVendasResponse(
        LocalDate inicio,
        LocalDate fim,
        BigDecimal faturamento,
        BigDecimal ticketMedio,
        BigDecimal custoTotal,
        long totalPedidos,
        long pedidosEntregues,
        long pedidosCancelados,
        List<VendasTimelineItem> timeline,
        List<VendasPorDiaItem> porDia,
        List<TopProdutoResponse> topProdutos,
        List<VendaHistoricoItem> historico
) {
}
