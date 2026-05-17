package com.dataplate.dto;

import java.math.BigDecimal;

public record DashboardResumoResponse(
        long pedidosRecebidos,
        long pedidosEmPreparo,
        long pedidosProntos,
        long pedidosEntregues,
        long pedidosCancelados,
        BigDecimal faturamentoTotal
) {
}
