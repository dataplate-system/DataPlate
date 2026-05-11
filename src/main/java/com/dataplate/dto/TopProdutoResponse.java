package com.dataplate.dto;

import java.math.BigDecimal;

public record TopProdutoResponse(
        Long produtoId,
        String nome,
<<<<<<< HEAD
        Long quantidadeVendida,
=======
        BigDecimal quantidadeVendida,
>>>>>>> 37a57ca (Armazenar os dados do front e back no banco de dados)
        BigDecimal faturamento
) {
}
