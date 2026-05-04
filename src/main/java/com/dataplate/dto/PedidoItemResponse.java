package com.dataplate.dto;

import java.math.BigDecimal;

public record PedidoItemResponse(
        Long produtoId,
        String nomeProduto,
        Integer quantidade,
        BigDecimal precoUnitario,
        BigDecimal subtotal
) {
}
