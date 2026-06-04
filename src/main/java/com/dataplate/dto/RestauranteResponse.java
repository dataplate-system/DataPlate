package com.dataplate.dto;

public record RestauranteResponse(
        Long id,
        String nome,
        String cnpj,
        String telefone,
        String endereco,
        String email
) {
}
