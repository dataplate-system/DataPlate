package com.dataplate.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record RelatorioResumoResponse(
        LocalDate inicio,
        LocalDate fim,
        long pedidosRecebidos,
        long pedidosEmPreparo,
        long pedidosProntos,
        long pedidosEntregues,
        long pedidosCancelados,
        BigDecimal faturamento,
        BigDecimal ticketMedio,
        List<TopProdutoResponse> topProdutos
) {
}
