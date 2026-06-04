package com.dataplate.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

public record RelatorioOperacionalResponse(
        LocalDate inicio,
        LocalDate fim,
        long totalPedidos,
        long pedidosEntregues,
        long pedidosCancelados,
        long pedidosRecebidos,
        long pedidosEmPreparo,
        long pedidosProntos,
        BigDecimal taxaCancelamento,
        BigDecimal taxaEntrega,
        BigDecimal ticketMedio,
        BigDecimal faturamento,
        double tempoMedioPreparoMin
) {
}
