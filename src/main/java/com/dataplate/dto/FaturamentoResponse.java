package com.dataplate.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

public record FaturamentoResponse(
        LocalDate inicio,
        LocalDate fim,
        BigDecimal faturamento
) {
}
