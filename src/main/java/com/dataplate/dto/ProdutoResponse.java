package com.dataplate.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record ProdutoResponse(
        Long id,
        String codigo,
        Long idCategoria,
        String nome,
        String descricao,
        BigDecimal preco,
        String imagem,
        Boolean ativo,
        Integer tempoPreparo,
        Boolean destaque,
        LocalDateTime criadoEm
) {
}
