package com.dataplate.dto;

import java.math.BigDecimal;
import java.util.List;

public record RelatorioCardapioResponse(
        List<RelatorioCardapioItem> topProdutos,
        long totalItensVendidos,
        BigDecimal faturamentoTotal
) {
}
