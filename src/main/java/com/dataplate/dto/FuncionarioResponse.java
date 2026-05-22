package com.dataplate.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record FuncionarioResponse(
        Long id,
        String codigo,
        String nome,
        String cpf,
        String telefone,
        String cargo,
        BigDecimal salario,
        Boolean ativo,
        LocalDateTime criadoEm
) {}
