package com.dataplate.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;

import java.math.BigDecimal;
import java.util.List;

public record PedidoCreateRequest(
        Integer numeroMesa,
        Long mesaId,
        Boolean vendaCaixa,
        String formaPagamento,
        BigDecimal desconto,
        String observacoes,
        @NotEmpty List<@Valid PedidoItemRequest> itens
) {
}
