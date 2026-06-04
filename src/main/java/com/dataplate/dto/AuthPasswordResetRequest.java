package com.dataplate.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AuthPasswordResetRequest(
        @NotBlank String cpf,
        @NotBlank @Size(min = 8) String novaSenha
) {
}
