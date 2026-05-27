package com.dataplate.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record PedidoItemRequest(
        @NotNull Long produtoId,
        @NotNull @Min(1) Integer quantidade
) {
}
