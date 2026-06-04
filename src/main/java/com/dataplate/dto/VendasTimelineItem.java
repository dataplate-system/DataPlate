package com.dataplate.dto;

import java.math.BigDecimal;

public record VendasTimelineItem(
        String label,
        BigDecimal valor,
        long quantidade
) {
}
