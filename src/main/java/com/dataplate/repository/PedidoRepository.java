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
}
