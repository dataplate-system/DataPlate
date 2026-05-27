package com.dataplate.dto;

import com.dataplate.entity.Role;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record AuthRegisterRequest(
        @NotBlank String nome,
        @NotBlank String cpf,
        @Size(min = 6) String senha,
        @NotNull Role role
) {
}
