package com.dataplate.dto;

import jakarta.validation.constraints.NotBlank;

public record ClienteRequest(
        String codigo,
        @NotBlank String nome,
        @NotBlank String cpf,
        String email,
        String telefone,
        String endereco
) {}
