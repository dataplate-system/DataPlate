package com.dataplate.repository;

import com.dataplate.entity.PedidoStatusHistorico;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface PedidoStatusHistoricoRepository extends JpaRepository<PedidoStatusHistorico, Long> {

    List<PedidoStatusHistorico> findByIdPedidoOrderByRegistradoEmAsc(Long idPedido);

    // Tempo médio entre RECEBIDO e ENTREGUE em minutos para pedidos no período
    @Query(value = """
            SELECT COALESCE(AVG(diff_min), 0)
            FROM (
                SELECT
                    h_inicio.id_pedido,
                    EXTRACT(EPOCH FROM (h_fim.registrado_em - h_inicio.registrado_em)) / 60.0 AS diff_min
                FROM pedido_status_historico h_inicio
                JOIN pedido_status_historico h_fim
                  ON h_fim.id_pedido = h_inicio.id_pedido
                 AND h_fim.status = 'ENTREGUE'
                WHERE h_inicio.status = 'RECEBIDO'
                  AND h_inicio.registrado_em BETWEEN :inicio AND :fim
            ) AS tempos
            """, nativeQuery = true)
    Double tempoMedioPreparo(@Param("inicio") LocalDateTime inicio, @Param("fim") LocalDateTime fim);
}
