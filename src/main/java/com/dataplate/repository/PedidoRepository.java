package com.dataplate.repository;

import com.dataplate.entity.Pedido;
import com.dataplate.entity.PedidoStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public interface PedidoRepository extends JpaRepository<Pedido, Long> {
    long countByStatus(PedidoStatus status);

    @Query("select coalesce(sum(p.valorTotal), 0) from Pedido p where p.status <> com.dataplate.entity.PedidoStatus.CANCELADO")
    BigDecimal faturamentoTotal();

    @Query("select coalesce(sum(p.valorTotal), 0) from Pedido p where p.status <> com.dataplate.entity.PedidoStatus.CANCELADO and p.dataHora between :inicio and :fim")
    BigDecimal faturamentoEntre(LocalDateTime inicio, LocalDateTime fim);

    List<Pedido> findTop10ByOrderByDataHoraDesc();
}
