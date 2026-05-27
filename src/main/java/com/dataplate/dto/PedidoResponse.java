package com.dataplate.dto;

import com.dataplate.entity.PedidoStatus;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record PedidoResponse(
        Long id,
        Integer numeroMesa,
        PedidoStatus status,
        LocalDateTime dataHora,
        BigDecimal valorTotal,
        List<PedidoItemResponse> itens
) {
}
