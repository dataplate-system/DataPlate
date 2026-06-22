package com.dataplate.dto;

public record CategoriaResponse(
        Long id,
        String nome,
        String descricao,
        Short ordem
) {
}
