package com.dataplate.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record ProdutoInsumoRequest(
        @NotNull Long insumoId,
        @NotNull @DecimalMin("0.001") BigDecimal quantidade
) {
}
