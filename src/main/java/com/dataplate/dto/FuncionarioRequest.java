package com.dataplate.dto;

import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;

public record FuncionarioRequest(
        String codigo,
        @NotBlank String nome,
        @NotBlank String cpf,
        String telefone,
        @NotBlank String cargo,
        BigDecimal salario
) {}
