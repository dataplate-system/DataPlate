package com.dataplate.repository;

import com.dataplate.entity.Pedido;
<<<<<<< HEAD
import com.dataplate.entity.PedidoStatus;
=======
>>>>>>> 37a57ca (Armazenar os dados do front e back no banco de dados)
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public interface PedidoRepository extends JpaRepository<Pedido, Long> {
<<<<<<< HEAD
    long countByStatus(PedidoStatus status);

    @Query("select coalesce(sum(p.valorTotal), 0) from Pedido p where p.status <> com.dataplate.entity.PedidoStatus.CANCELADO")
    BigDecimal faturamentoTotal();

    @Query("select coalesce(sum(p.valorTotal), 0) from Pedido p where p.status <> com.dataplate.entity.PedidoStatus.CANCELADO and p.dataHora between :inicio and :fim")
=======
    long countByIdStatus(Integer idStatus);

    @Query("select coalesce(sum(p.valorTotal), 0) from Pedido p where p.idStatus <> 5")
    BigDecimal faturamentoTotal();

    @Query("select coalesce(sum(p.valorTotal), 0) from Pedido p where p.idStatus <> 5 and p.dataHora between :inicio and :fim")
>>>>>>> 37a57ca (Armazenar os dados do front e back no banco de dados)
    BigDecimal faturamentoEntre(LocalDateTime inicio, LocalDateTime fim);

    List<Pedido> findTop10ByOrderByDataHoraDesc();
}
