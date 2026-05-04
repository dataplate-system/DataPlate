package com.dataplate.dto;

import java.math.BigDecimal;

public record TopProdutoResponse(
        Long produtoId,
        String nome,
        Long quantidadeVendida,
        BigDecimal faturamento
) {
}
