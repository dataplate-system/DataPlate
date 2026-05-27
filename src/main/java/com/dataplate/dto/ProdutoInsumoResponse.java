package com.dataplate.dto;

import java.math.BigDecimal;

public record ProdutoInsumoResponse(
        Long id,
        Long produtoId,
        Long insumoId,
        String nomeInsumo,
        String unidade,
        BigDecimal quantidade
) {
}
