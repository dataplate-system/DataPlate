package com.dataplate.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record MesaRequest(
        @NotNull @Min(1) Integer numero,
        @NotNull @Min(1) Integer capacidade,
        @NotBlank String status,
        String localizacao
) {
}
