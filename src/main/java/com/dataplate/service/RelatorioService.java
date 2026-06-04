package com.dataplate.service;

import com.dataplate.dto.RelatorioResumoResponse;
import com.dataplate.dto.TopProdutoResponse;
import com.dataplate.entity.Pedido;
import com.dataplate.repository.PedidoItemRepository;
import com.dataplate.repository.PedidoRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class RelatorioService {
    private static final int STATUS_RECEBIDO_ID = 1;
    private static final int STATUS_EM_PREPARO_ID = 2;
    private static final int STATUS_PRONTO_ID = 3;
    private static final int STATUS_ENTREGUE_ID = 4;
    private static final int STATUS_CANCELADO_ID = 5;

    private final PedidoRepository pedidoRepository;
    private final PedidoItemRepository pedidoItemRepository;

    @Transactional(readOnly = true)
    public RelatorioResumoResponse resumo(LocalDate inicio, LocalDate fim) {
        LocalDate dataInicio = inicio == null ? LocalDate.now() : inicio;
        LocalDate dataFim = fim == null ? dataInicio : fim;
        LocalDateTime inicioDia = dataInicio.atStartOfDay();
        LocalDateTime fimDia = dataFim.atTime(LocalTime.MAX);

        List<Pedido> pedidos = pedidoRepository.findByDataHoraBetweenOrderByDataHoraDesc(inicioDia, fimDia);
        BigDecimal faturamento = pedidoRepository.faturamentoEntre(inicioDia, fimDia);
        long pedidosPagos = pedidos.stream().filter(pedido -> pedido.getIdStatus() != STATUS_CANCELADO_ID).count();
        BigDecimal ticketMedio = pedidosPagos == 0
                ? BigDecimal.ZERO
                : faturamento.divide(BigDecimal.valueOf(pedidosPagos), 2, RoundingMode.HALF_UP);

        List<TopProdutoResponse> topProdutos = pedidoItemRepository.topProdutos().stream()
                .limit(5)
                .toList();

        return new RelatorioResumoResponse(
                dataInicio,
                dataFim,
                countByStatus(pedidos, STATUS_RECEBIDO_ID),
                countByStatus(pedidos, STATUS_EM_PREPARO_ID),
                countByStatus(pedidos, STATUS_PRONTO_ID),
                countByStatus(pedidos, STATUS_ENTREGUE_ID),
                countByStatus(pedidos, STATUS_CANCELADO_ID),
                faturamento,
                ticketMedio,
                topProdutos
        );
    }

    private long countByStatus(List<Pedido> pedidos, int statusId) {
        return pedidos.stream().filter(pedido -> pedido.getIdStatus() == statusId).count();
    }
}
