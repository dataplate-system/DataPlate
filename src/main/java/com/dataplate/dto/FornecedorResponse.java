package com.dataplate.dto;

import java.time.LocalDateTime;

public record FornecedorResponse(
        Long id,
        String razaoSocial,
        String cnpj,
        String especialidade,
        String telefone,
        String email,
        Boolean ativo,
        LocalDateTime criadoEm
) {}
