package com.dataplate.service;

import com.dataplate.dto.RelatorioCardapioResponse;
import com.dataplate.dto.RelatorioOperacionalResponse;
import com.dataplate.dto.RelatorioResumoResponse;
import com.dataplate.dto.RelatorioVendasResponse;
import com.dataplate.dto.TopProdutoResponse;
import com.dataplate.dto.VendaHistoricoItem;
import com.dataplate.dto.VendasPorDiaItem;
import com.dataplate.dto.VendasTimelineItem;
import com.dataplate.entity.Pedido;
import com.dataplate.repository.PedidoItemRepository;
import com.dataplate.repository.PedidoRepository;
import com.dataplate.repository.PedidoStatusHistoricoRepository;
import com.dataplate.repository.MesaRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

@Service
@RequiredArgsConstructor
public class RelatorioService {
    private static final int STATUS_RECEBIDO_ID  = 1;
    private static final int STATUS_EM_PREPARO_ID = 2;
    private static final int STATUS_PRONTO_ID    = 3;
    private static final int STATUS_ENTREGUE_ID  = 4;
    private static final int STATUS_CANCELADO_ID = 5;

    private final PedidoRepository pedidoRepository;
    private final PedidoItemRepository pedidoItemRepository;
    private final PedidoStatusHistoricoRepository historicoRepository;
    private final MesaRepository mesaRepository;
    private final com.dataplate.repository.ProdutoInsumoRepository produtoInsumoRepository;

    // ── RESUMO (dashboard) ─────────────────────────────────────────
    @Transactional(readOnly = true)
    public RelatorioResumoResponse resumo(LocalDate inicio, LocalDate fim) {
        LocalDate dataInicio = inicio == null ? LocalDate.now() : inicio;
        LocalDate dataFim = fim == null ? dataInicio : fim;
        LocalDateTime inicioDia = dataInicio.atStartOfDay();
        LocalDateTime fimDia = dataFim.atTime(LocalTime.MAX);

        List<Pedido> pedidos = pedidoRepository.findByDataHoraBetweenWithItensOrderByDataHoraDesc(inicioDia, fimDia);
        BigDecimal faturamento = pedidoRepository.faturamentoEntre(inicioDia, fimDia);
        long pedidosPagos = pedidos.stream().filter(p -> p.getIdStatus() != STATUS_CANCELADO_ID).count();
        BigDecimal ticketMedio = pedidosPagos == 0 ? BigDecimal.ZERO
                : faturamento.divide(BigDecimal.valueOf(pedidosPagos), 2, RoundingMode.HALF_UP);

        List<TopProdutoResponse> topProdutos = pedidoItemRepository.topProdutosEntre(inicioDia, fimDia)
                .stream().limit(5).toList();

        return new RelatorioResumoResponse(
                dataInicio, dataFim,
                countByStatus(pedidos, STATUS_RECEBIDO_ID),
                countByStatus(pedidos, STATUS_EM_PREPARO_ID),
                countByStatus(pedidos, STATUS_PRONTO_ID),
                countByStatus(pedidos, STATUS_ENTREGUE_ID),
                countByStatus(pedidos, STATUS_CANCELADO_ID),
                faturamento, ticketMedio, topProdutos
        );
    }

    // ── VENDAS ─────────────────────────────────────────────────────
    @Transactional(readOnly = true)
    public RelatorioVendasResponse vendas(LocalDate inicio, LocalDate fim) {
        LocalDate dataInicio = inicio == null ? LocalDate.now() : inicio;
        LocalDate dataFim = fim == null ? dataInicio : fim;
        LocalDateTime inicioDia = dataInicio.atStartOfDay();
        LocalDateTime fimDia = dataFim.atTime(LocalTime.MAX);

        List<Pedido> pedidos = pedidoRepository.findByDataHoraBetweenWithItensOrderByDataHoraDesc(inicioDia, fimDia);
        BigDecimal faturamento = pedidoRepository.faturamentoEntre(inicioDia, fimDia);

        long entregues  = countByStatus(pedidos, STATUS_ENTREGUE_ID);
        long cancelados = countByStatus(pedidos, STATUS_CANCELADO_ID);
        long pagos      = pedidos.stream().filter(p -> p.getIdStatus() != STATUS_CANCELADO_ID).count();
        BigDecimal ticketMedio = pagos == 0 ? BigDecimal.ZERO
                : faturamento.divide(BigDecimal.valueOf(pagos), 2, RoundingMode.HALF_UP);

        List<VendasTimelineItem> timeline = gerarTimeline(pedidos, dataInicio, dataFim);
        List<VendasPorDiaItem>   porDia   = gerarPorDia(pedidos, dataInicio, dataFim);
        List<TopProdutoResponse> top = pedidoItemRepository.topProdutosEntre(inicioDia, fimDia)
                .stream().limit(10).toList();

        BigDecimal custoTotal = produtoInsumoRepository.custoTotalEntre(inicioDia, fimDia);
        Map<Long, Integer> mesaMap = carregarMesaMap();
        List<VendaHistoricoItem> historico = pedidos.stream()
                .map(p -> toHistoricoItem(p, mesaMap))
                .toList();

        return new RelatorioVendasResponse(
                dataInicio, dataFim, faturamento, ticketMedio, custoTotal,
                pedidos.size(), entregues, cancelados,
                timeline, porDia, top, historico
        );
    }

    // ── CARDÁPIO ───────────────────────────────────────────────────
    @Transactional(readOnly = true)
    public RelatorioCardapioResponse cardapio(LocalDate inicio, LocalDate fim) {
        LocalDate dataInicio = inicio == null ? LocalDate.now().minusDays(30) : inicio;
        LocalDate dataFim = fim == null ? LocalDate.now() : fim;
        LocalDateTime inicioDia = dataInicio.atStartOfDay();
        LocalDateTime fimDia = dataFim.atTime(LocalTime.MAX);

        List<TopProdutoResponse> top = pedidoItemRepository.topProdutosEntre(inicioDia, fimDia);

        long totalItens = top.stream()
                .mapToLong(t -> t.quantidadeVendida() == null ? 0 : t.quantidadeVendida().longValue())
                .sum();
        BigDecimal faturamentoTotal = top.stream()
                .map(TopProdutoResponse::faturamento)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return new RelatorioCardapioResponse(top, totalItens, faturamentoTotal);
    }

    // ── OPERACIONAL ────────────────────────────────────────────────
    @Transactional(readOnly = true)
    public RelatorioOperacionalResponse operacional(LocalDate inicio, LocalDate fim) {
        LocalDate dataInicio = inicio == null ? LocalDate.now() : inicio;
        LocalDate dataFim = fim == null ? dataInicio : fim;
        LocalDateTime inicioDia = dataInicio.atStartOfDay();
        LocalDateTime fimDia = dataFim.atTime(LocalTime.MAX);

        List<Pedido> pedidos = pedidoRepository.findByDataHoraBetweenWithItensOrderByDataHoraDesc(inicioDia, fimDia);
        BigDecimal faturamento = pedidoRepository.faturamentoEntre(inicioDia, fimDia);

        long total      = pedidos.size();
        long entregues  = countByStatus(pedidos, STATUS_ENTREGUE_ID);
        long cancelados = countByStatus(pedidos, STATUS_CANCELADO_ID);
        long recebidos  = countByStatus(pedidos, STATUS_RECEBIDO_ID);
        long emPreparo  = countByStatus(pedidos, STATUS_EM_PREPARO_ID);
        long prontos    = countByStatus(pedidos, STATUS_PRONTO_ID);

        BigDecimal taxaCancelamento = total == 0 ? BigDecimal.ZERO
                : BigDecimal.valueOf(cancelados * 100.0 / total).setScale(1, RoundingMode.HALF_UP);
        BigDecimal taxaEntrega = total == 0 ? BigDecimal.ZERO
                : BigDecimal.valueOf(entregues * 100.0 / total).setScale(1, RoundingMode.HALF_UP);

        long pagos = pedidos.stream().filter(p -> p.getIdStatus() != STATUS_CANCELADO_ID).count();
        BigDecimal ticketMedio = pagos == 0 ? BigDecimal.ZERO
                : faturamento.divide(BigDecimal.valueOf(pagos), 2, RoundingMode.HALF_UP);

        Double tempoMedio = historicoRepository.tempoMedioPreparo(inicioDia, fimDia);
        double tempoMedioMin = tempoMedio != null ? Math.round(tempoMedio * 10.0) / 10.0 : 0.0;

        return new RelatorioOperacionalResponse(
                dataInicio, dataFim,
                total, entregues, cancelados, recebidos, emPreparo, prontos,
                taxaCancelamento, taxaEntrega, ticketMedio, faturamento, tempoMedioMin
        );
    }

    // ── HELPERS ────────────────────────────────────────────────────
    private long countByStatus(List<Pedido> pedidos, int statusId) {
        return pedidos.stream().filter(p -> p.getIdStatus() == statusId).count();
    }

    private VendaHistoricoItem toHistoricoItem(Pedido pedido, Map<Long, Integer> mesaMap) {
        long itens = pedido.getItens() == null ? 0 : pedido.getItens().stream()
                .mapToLong(item -> item.getQuantidade() == null ? 0 : item.getQuantidade().longValue())
                .sum();
        return new VendaHistoricoItem(
                pedido.getId(),
                pedido.getDataHora(),
                pedido.getIdMesa() == null ? "CAIXA" : "MESA",
                numeroMesa(pedido.getIdMesa(), mesaMap),
                toStatusLabel(pedido.getIdStatus()),
                itens,
                pedido.getValorTotal()
        );
    }

    private Map<Long, Integer> carregarMesaMap() {
        return mesaRepository.findAll().stream()
                .collect(Collectors.toMap(com.dataplate.entity.Mesa::getId, com.dataplate.entity.Mesa::getNumero));
    }

    private Integer numeroMesa(Integer idMesa, Map<Long, Integer> mesaMap) {
        if (idMesa == null) return null;
        return mesaMap.getOrDefault(idMesa.longValue(), idMesa);
    }

    private String toStatusLabel(Integer idStatus) {
        return switch (idStatus) {
            case STATUS_RECEBIDO_ID -> "RECEBIDO";
            case STATUS_EM_PREPARO_ID -> "EM_PREPARO";
            case STATUS_PRONTO_ID -> "PRONTO";
            case STATUS_ENTREGUE_ID -> "ENTREGUE";
            case STATUS_CANCELADO_ID -> "CANCELADO";
            default -> "RECEBIDO";
        };
    }

    private List<VendasTimelineItem> gerarTimeline(List<Pedido> pedidos, LocalDate inicio, LocalDate fim) {
        if (inicio.equals(fim)) {
            // Mesmo dia: agrupa por hora (mostra horas com atividade)
            return IntStream.range(0, 24)
                    .mapToObj(h -> {
                        List<Pedido> doHora = pedidos.stream()
                                .filter(p -> p.getDataHora() != null
                                        && p.getDataHora().getHour() == h
                                        && p.getIdStatus() != STATUS_CANCELADO_ID)
                                .toList();
                        BigDecimal valor = doHora.stream()
                                .map(Pedido::getValorTotal).filter(Objects::nonNull)
                                .reduce(BigDecimal.ZERO, BigDecimal::add);
                        return new VendasTimelineItem(String.format("%02d:00", h), valor, doHora.size());
                    })
                    .toList();
        } else {
            // Vários dias: agrupa por data
            DateTimeFormatter fmt = DateTimeFormatter.ofPattern("dd/MM");
            return inicio.datesUntil(fim.plusDays(1))
                    .map(d -> {
                        List<Pedido> doDia = pedidos.stream()
                                .filter(p -> p.getDataHora() != null
                                        && p.getDataHora().toLocalDate().equals(d)
                                        && p.getIdStatus() != STATUS_CANCELADO_ID)
                                .toList();
                        BigDecimal valor = doDia.stream()
                                .map(Pedido::getValorTotal).filter(Objects::nonNull)
                                .reduce(BigDecimal.ZERO, BigDecimal::add);
                        return new VendasTimelineItem(d.format(fmt), valor, doDia.size());
                    })
                    .toList();
        }
    }

    private List<VendasPorDiaItem> gerarPorDia(List<Pedido> pedidos, LocalDate inicio, LocalDate fim) {
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("dd/MM/yyyy");
        return inicio.datesUntil(fim.plusDays(1))
                .map(d -> {
                    List<Pedido> doDia = pedidos.stream()
                            .filter(p -> p.getDataHora() != null && p.getDataHora().toLocalDate().equals(d))
                            .toList();
                    long count = doDia.size();
                    BigDecimal fat = doDia.stream()
                            .filter(p -> p.getIdStatus() != STATUS_CANCELADO_ID)
                            .map(Pedido::getValorTotal).filter(Objects::nonNull)
                            .reduce(BigDecimal.ZERO, BigDecimal::add);
                    long pagos = doDia.stream().filter(p -> p.getIdStatus() != STATUS_CANCELADO_ID).count();
                    BigDecimal ticket = pagos == 0 ? BigDecimal.ZERO
                            : fat.divide(BigDecimal.valueOf(pagos), 2, RoundingMode.HALF_UP);
                    return new VendasPorDiaItem(d.format(fmt), count, fat, ticket);
                })
                .filter(item -> item.pedidos() > 0)
                .toList();
    }
}
