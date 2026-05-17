package com.dataplate.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record InsumoRequest(
        @NotBlank String nome,
        @NotBlank String unidade,
        @NotNull @DecimalMin("0.000") BigDecimal quantidadeAtual,
        @NotNull @DecimalMin("0.000") BigDecimal quantidadeMinima,
        @NotNull @DecimalMin("0.00") BigDecimal custoUnitario
) {
}
