package com.dataplate.repository;

import com.dataplate.entity.ProdutoInsumo;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public interface ProdutoInsumoRepository extends JpaRepository<ProdutoInsumo, Long> {

    List<ProdutoInsumo> findByProdutoId(Long produtoId);

    void deleteByProdutoId(Long produtoId);

    void deleteByProdutoIdAndInsumoId(Long produtoId, Long insumoId);

    @Query(value = """
            SELECT COALESCE(SUM(pi2.quantidade * ins.custo_unitario * i.quantidade), 0)
            FROM item_pedido i
            JOIN pedido p ON p.id_pedido = i.id_pedido
            JOIN produto_insumos pi2 ON pi2.produto_id = i.id_produto
            JOIN insumos ins ON ins.id = pi2.insumo_id
            WHERE p.id_status <> 5
              AND p.data_hora BETWEEN :inicio AND :fim
            """, nativeQuery = true)
    BigDecimal custoTotalEntre(@Param("inicio") LocalDateTime inicio, @Param("fim") LocalDateTime fim);

    @Query(value = """
            SELECT i.id_produto, COALESCE(SUM(pi2.quantidade * ins.custo_unitario * i.quantidade), 0)
            FROM item_pedido i
            JOIN pedido p ON p.id_pedido = i.id_pedido
            JOIN produto_insumos pi2 ON pi2.produto_id = i.id_produto
            JOIN insumos ins ON ins.id = pi2.insumo_id
            WHERE p.id_status <> 5
              AND p.data_hora BETWEEN :inicio AND :fim
            GROUP BY i.id_produto
            """, nativeQuery = true)
    List<Object[]> custoPorProdutoEntre(@Param("inicio") LocalDateTime inicio, @Param("fim") LocalDateTime fim);
}
