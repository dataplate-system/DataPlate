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
            where i.pedido.idStatus <> 5
            group by i.produto.id, i.produto.nome
            order by sum(i.quantidade) desc
            """)
    List<TopProdutoResponse> topProdutos();

    @Query("""
            select new com.dataplate.dto.TopProdutoResponse(
                i.produto.id,
                i.produto.nome,
                sum(i.quantidade),
                sum(i.subtotal)
            )
            from PedidoItem i
            where i.pedido.idStatus <> 5
              and i.pedido.dataHora between :inicio and :fim
            group by i.produto.id, i.produto.nome
            order by sum(i.quantidade) desc
            """)
    List<TopProdutoResponse> topProdutosEntre(
            @org.springframework.data.repository.query.Param("inicio") java.time.LocalDateTime inicio,
            @org.springframework.data.repository.query.Param("fim") java.time.LocalDateTime fim);
}
