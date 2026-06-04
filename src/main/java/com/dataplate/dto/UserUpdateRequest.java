package com.dataplate.dto;

import com.dataplate.entity.Role;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record UserUpdateRequest(
        @NotBlank String nome,
        @NotBlank String cpf,
        @NotNull Role role
) {
}
