package com.dataplate.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record VendaHistoricoItem(
        Long id,
        LocalDateTime dataHora,
        String origem,
        Integer numeroMesa,
        String status,
        long itens,
        BigDecimal valorTotal
) {
}
