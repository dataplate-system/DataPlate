package com.dataplate.dto;

import java.time.LocalDateTime;

public record ClienteResponse(
        Long id,
        String codigo,
        String nome,
        String cpf,
        String email,
        String telefone,
        String endereco,
        Boolean ativo,
        LocalDateTime criadoEm
) {}
