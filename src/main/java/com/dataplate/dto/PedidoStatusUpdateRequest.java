package com.dataplate.dto;

import com.dataplate.entity.PedidoStatus;
import jakarta.validation.constraints.NotNull;

public record PedidoStatusUpdateRequest(@NotNull PedidoStatus status) {
}
