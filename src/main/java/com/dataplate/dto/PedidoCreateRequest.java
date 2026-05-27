package com.dataplate.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public record PedidoCreateRequest(
        @NotNull @Min(1) Integer numeroMesa,
        @NotEmpty List<@Valid PedidoItemRequest> itens
) {
}
