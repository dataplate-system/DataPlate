package com.dataplate.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record RestauranteRequest(
        @NotBlank String nome,
        String cnpj,
        String telefone,
        String endereco,
        @Email String email
) {
}
