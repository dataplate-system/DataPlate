package com.dataplate.dto;

import jakarta.validation.constraints.NotBlank;

public record FornecedorRequest(
        String codigo,
        @NotBlank String razaoSocial,
        @NotBlank String cnpj,
        String especialidade,
        String telefone,
        String email
) {}
