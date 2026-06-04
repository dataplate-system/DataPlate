package com.dataplate.dto;

public record MesaResponse(
        Long id,
        Integer numero,
        Integer capacidade,
        String status,
        String localizacao,
        Boolean ativo
) {
}
