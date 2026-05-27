package com.dataplate.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record ProdutoRequest(
        @NotBlank String nome,
        String descricao,
        @NotNull @DecimalMin("0.01") BigDecimal preco,
        String imagemUrl,
        @NotNull Boolean disponivel,
        @NotNull @Min(1) Integer tempoPreparo
) {
}
