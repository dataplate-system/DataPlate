package com.dataplate.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;

public record ProdutoRequest(
        @NotBlank String nome,
        String codigo,
        @NotNull @Positive Long idCategoria,
        String descricao,
        @NotNull @DecimalMin("0.01") BigDecimal preco,
        String imagem,
        @NotNull Boolean ativo,
        Integer tempoPreparo,
        Boolean destaque
) {
}
