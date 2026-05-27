package com.dataplate.dto;

import java.math.BigDecimal;

public record InsumoResponse(
        Long id,
        String nome,
        String unidade,
        BigDecimal quantidadeAtual,
        BigDecimal quantidadeMinima,
        BigDecimal custoUnitario
) {
}
