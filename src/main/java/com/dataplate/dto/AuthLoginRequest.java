package com.dataplate.dto;

import jakarta.validation.constraints.NotBlank;

public record AuthLoginRequest(
        @NotBlank String cpf,
        @NotBlank String senha
) {
}
