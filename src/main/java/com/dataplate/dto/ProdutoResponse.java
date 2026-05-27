package com.dataplate.dto;

import java.time.LocalDateTime;

public record ProdutoResponse(
    Long idProduto,
    String Codigo,
    Long idCategoria,
    String nome,
    String descricao,
    Double preco,
    String imagem,
    Boolean ativo,
    Integer tempoPreparo,
    Boolean destaque,
    LocalDateTime criadoEm
) {}