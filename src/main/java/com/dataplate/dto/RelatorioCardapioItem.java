package com.dataplate.dto;

import java.math.BigDecimal;

public record RelatorioCardapioItem(
        Long produtoId,
        String nome,
        Long idCategoria,
        BigDecimal precoVenda,
        BigDecimal quantidadeVendida,
        BigDecimal faturamento,
        BigDecimal custoTotal,
        BigDecimal lucro
) {
}
