package com.dataplate.dto;

import java.math.BigDecimal;

public record VendasPorDiaItem(
        String data,
        long pedidos,
        BigDecimal faturamento,
        BigDecimal ticketMedio
) {
}
