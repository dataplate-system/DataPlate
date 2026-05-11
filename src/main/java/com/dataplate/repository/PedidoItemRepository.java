package com.dataplate.repository;

import com.dataplate.dto.TopProdutoResponse;
import com.dataplate.entity.PedidoItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface PedidoItemRepository extends JpaRepository<PedidoItem, Long> {
    @Query("""
            select new com.dataplate.dto.TopProdutoResponse(
                i.produto.id,
                i.produto.nome,
                sum(i.quantidade),
                sum(i.subtotal)
            )
            from PedidoItem i
<<<<<<< HEAD
            where i.pedido.status <> com.dataplate.entity.PedidoStatus.CANCELADO
=======
            where i.pedido.idStatus <> 5
>>>>>>> 37a57ca (Armazenar os dados do front e back no banco de dados)
            group by i.produto.id, i.produto.nome
            order by sum(i.quantidade) desc
            """)
    List<TopProdutoResponse> topProdutos();
}
