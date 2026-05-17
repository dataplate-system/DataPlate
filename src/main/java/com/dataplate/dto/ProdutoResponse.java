package com.dataplate.dto;

import java.math.BigDecimal;

public record ProdutoResponse(
        Long id,
        String nome,
        String descricao,
        BigDecimal preco,
        String imagemUrl,
        Boolean disponivel,
        Integer tempoPreparo
) {
}
