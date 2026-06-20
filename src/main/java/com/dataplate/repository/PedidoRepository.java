package com.dataplate.repository;

import com.dataplate.entity.Pedido;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public interface PedidoRepository extends JpaRepository<Pedido, Long> {
    long countByIdStatus(Integer idStatus);

    @Query("select coalesce(sum(p.valorTotal), 0) from Pedido p where p.idStatus <> 5")
    BigDecimal faturamentoTotal();

    @Query("select coalesce(sum(p.valorTotal), 0) from Pedido p where p.idStatus <> 5 and p.dataHora between :inicio and :fim")
    BigDecimal faturamentoEntre(LocalDateTime inicio, LocalDateTime fim);

    List<Pedido> findTop5ByOrderByDataHoraDesc();

    List<Pedido> findTop10ByOrderByDataHoraDesc();

    @Query("SELECT DISTINCT p FROM Pedido p LEFT JOIN FETCH p.itens i LEFT JOIN FETCH i.produto ORDER BY p.dataHora DESC")
    List<Pedido> findAllWithItensOrderByDataHoraDesc();

    Page<Pedido> findAllByOrderByDataHoraDesc(Pageable pageable);

    @Query("SELECT p.id FROM Pedido p ORDER BY p.dataHora DESC")
    List<Long> findAllIdsPaged(Pageable pageable);

    @Query("SELECT DISTINCT p FROM Pedido p LEFT JOIN FETCH p.itens i LEFT JOIN FETCH i.produto WHERE p.id IN :ids ORDER BY p.dataHora DESC")
    List<Pedido> findByIdsWithItens(@Param("ids") List<Long> ids);

    @Query("SELECT DISTINCT p FROM Pedido p LEFT JOIN FETCH p.itens i LEFT JOIN FETCH i.produto WHERE p.idMesa = :idMesa ORDER BY p.dataHora DESC")
    List<Pedido> findByIdMesaWithItensOrderByDataHoraDesc(@Param("idMesa") Integer idMesa);

    @Query("SELECT DISTINCT p FROM Pedido p LEFT JOIN FETCH p.itens i LEFT JOIN FETCH i.produto WHERE p.dataHora BETWEEN :inicio AND :fim ORDER BY p.dataHora DESC")
    List<Pedido> findByDataHoraBetweenWithItensOrderByDataHoraDesc(@Param("inicio") LocalDateTime inicio, @Param("fim") LocalDateTime fim);

    List<Pedido> findByIdStatusAndDataHoraBetweenOrderByDataHoraDesc(Integer idStatus, LocalDateTime inicio, LocalDateTime fim);

    @Query("SELECT p.idStatus, COUNT(p) FROM Pedido p WHERE p.dataHora BETWEEN :inicio AND :fim GROUP BY p.idStatus")
    List<Object[]> countsByStatusBetween(@Param("inicio") LocalDateTime inicio, @Param("fim") LocalDateTime fim);

    @Query("SELECT COUNT(p) FROM Pedido p WHERE p.dataHora BETWEEN :inicio AND :fim")
    long countTotalBetween(@Param("inicio") LocalDateTime inicio, @Param("fim") LocalDateTime fim);

    @Query(value = "SELECT EXTRACT(HOUR FROM data_hora)::int AS hora, COUNT(*) AS qtd, COALESCE(SUM(valor_total), 0) AS total FROM pedido WHERE data_hora BETWEEN :inicio AND :fim AND id_status <> 5 GROUP BY hora ORDER BY hora", nativeQuery = true)
    List<Object[]> timelineByHour(@Param("inicio") LocalDateTime inicio, @Param("fim") LocalDateTime fim);

    @Query(value = "SELECT DATE(data_hora) AS dia, COUNT(*) AS qtd, COALESCE(SUM(valor_total), 0) AS total FROM pedido WHERE data_hora BETWEEN :inicio AND :fim AND id_status <> 5 GROUP BY dia ORDER BY dia", nativeQuery = true)
    List<Object[]> timelineByDay(@Param("inicio") LocalDateTime inicio, @Param("fim") LocalDateTime fim);

    @Query(value = "SELECT DATE(data_hora) AS dia, COUNT(*) AS total_pedidos, COALESCE(SUM(CASE WHEN id_status <> 5 THEN valor_total ELSE 0 END), 0) AS faturamento, COUNT(CASE WHEN id_status <> 5 THEN 1 END) AS pagos FROM pedido WHERE data_hora BETWEEN :inicio AND :fim GROUP BY dia HAVING COUNT(*) > 0 ORDER BY dia", nativeQuery = true)
    List<Object[]> porDia(@Param("inicio") LocalDateTime inicio, @Param("fim") LocalDateTime fim);

    @Query(value = "SELECT p.id, p.data_hora, p.id_mesa, p.id_status, p.valor_total, COALESCE(SUM(pi.quantidade), 0) AS total_itens FROM pedido p LEFT JOIN pedido_item pi ON pi.id_pedido = p.id WHERE p.data_hora BETWEEN :inicio AND :fim GROUP BY p.id, p.data_hora, p.id_mesa, p.id_status, p.valor_total ORDER BY p.data_hora DESC LIMIT 200", nativeQuery = true)
    List<Object[]> historicoLimitado(@Param("inicio") LocalDateTime inicio, @Param("fim") LocalDateTime fim);
}
