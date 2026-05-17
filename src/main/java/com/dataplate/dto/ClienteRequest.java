package com.dataplate.dto;

import jakarta.validation.constraints.NotBlank;

public record ClienteRequest(
        @NotBlank String nome,
        @NotBlank String cpf,
        String email,
        String telefone,
        String endereco
) {}
