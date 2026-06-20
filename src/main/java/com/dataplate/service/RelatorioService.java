package com.dataplate.service;

import com.dataplate.dto.RelatorioCardapioResponse;
import com.dataplate.dto.RelatorioOperacionalResponse;
import com.dataplate.dto.RelatorioResumoResponse;
import com.dataplate.dto.RelatorioVendasResponse;
import com.dataplate.dto.TopProdutoResponse;
import com.dataplate.dto.VendaHistoricoItem;
import com.dataplate.dto.VendasPorDiaItem;
import com.dataplate.dto.VendasTimelineItem;
import com.dataplate.repository.PedidoItemRepository;
import com.dataplate.repository.PedidoRepository;
import com.dataplate.repository.PedidoStatusHistoricoRepository;
import com.dataplate.repository.ProdutoInsumoRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class RelatorioService {
    private static final int STATUS_RECEBIDO_ID   = 1;
    private static final int STATUS_EM_PREPARO_ID = 2;
    private static final int STATUS_PRONTO_ID     = 3;
    private static final int STATUS_ENTREGUE_ID   = 4;
    private static final int STATUS_CANCELADO_ID  = 5;

    private final PedidoRepository pedidoRepository;
    private final PedidoItemRepository pedidoItemRepository;
    private final PedidoStatusHistoricoRepository historicoRepository;
    private final ProdutoInsumoRepository produtoInsumoRepository;
    private final MesaService mesaService;

    // ── RESUMO (dashboard) ─────────────────────────────────────────
    @Transactional(readOnly = true)
    public RelatorioResumoResponse resumo(LocalDate inicio, LocalDate fim) {
        LocalDate dataInicio = inicio == null ? LocalDate.now() : inicio;
        LocalDate dataFim    = fim   == null ? dataInicio : fim;
        LocalDateTime inicioDia = dataInicio.atStartOfDay();
        LocalDateTime fimDia    = dataFim.atTime(LocalTime.MAX);

        Map<Integer, Long> byStatus = buildStatusCountMap(
                pedidoRepository.countsByStatusBetween(inicioDia, fimDia));

        BigDecimal faturamento = pedidoRepository.faturamentoEntre(inicioDia, fimDia);
        long pedidosPagos = pedidoRepository.countTotalBetween(inicioDia, fimDia)
                - byStatus.getOrDefault(STATUS_CANCELADO_ID, 0L);
        BigDecimal ticketMedio = pedidosPagos == 0 ? BigDecimal.ZERO
                : faturamento.divide(BigDecimal.valueOf(pedidosPagos), 2, RoundingMode.HALF_UP);

        List<TopProdutoResponse> topProdutos = pedidoItemRepository.topProdutosEntre(inicioDia, fimDia)
                .stream().limit(5).toList();

        return new RelatorioResumoResponse(
                dataInicio, dataFim,
                byStatus.getOrDefault(STATUS_RECEBIDO_ID,   0L),
                byStatus.getOrDefault(STATUS_EM_PREPARO_ID, 0L),
                byStatus.getOrDefault(STATUS_PRONTO_ID,     0L),
                byStatus.getOrDefault(STATUS_ENTREGUE_ID,   0L),
                byStatus.getOrDefault(STATUS_CANCELADO_ID,  0L),
                faturamento, ticketMedio, topProdutos
        );
    }

    // ── VENDAS ─────────────────────────────────────────────────────
    @Transactional(readOnly = true)
    public RelatorioVendasResponse vendas(LocalDate inicio, LocalDate fim) {
        LocalDate dataInicio = inicio == null ? LocalDate.now() : inicio;
        LocalDate dataFim    = fim   == null ? dataInicio : fim;
        LocalDateTime inicioDia = dataInicio.atStartOfDay();
        LocalDateTime fimDia    = dataFim.atTime(LocalTime.MAX);

        Map<Integer, Long> byStatus = buildStatusCountMap(
                pedidoRepository.countsByStatusBetween(inicioDia, fimDia));

        long totalPedidos = pedidoRepository.countTotalBetween(inicioDia, fimDia);
        long entregues    = byStatus.getOrDefault(STATUS_ENTREGUE_ID,  0L);
        long cancelados   = byStatus.getOrDefault(STATUS_CANCELADO_ID, 0L);
        long pagos        = totalPedidos - cancelados;

        BigDecimal faturamento = pedidoRepository.faturamentoEntre(inicioDia, fimDia);
        BigDecimal ticketMedio = pagos == 0 ? BigDecimal.ZERO
                : faturamento.divide(BigDecimal.valueOf(pagos), 2, RoundingMode.HALF_UP);

        List<VendasTimelineItem> timeline = gerarTimelineDB(dataInicio, dataFim, inicioDia, fimDia);
        List<VendasPorDiaItem>   porDia   = gerarPorDiaDB(dataInicio, dataFim, inicioDia, fimDia);

        List<TopProdutoResponse> top = pedidoItemRepository.topProdutosEntre(inicioDia, fimDia)
                .stream().limit(10).toList();

        BigDecimal custoTotal = produtoInsumoRepository.custoTotalEntre(inicioDia, fimDia);

        Map<Long, Integer> mesaMap = mesaService.getMesaMap();
        List<VendaHistoricoItem> historico = pedidoRepository.historicoLimitado(inicioDia, fimDia)
                .stream().map(row -> toHistoricoItemFromRow(row, mesaMap)).toList();

        return new RelatorioVendasResponse(
                dataInicio, dataFim, faturamento, ticketMedio, custoTotal,
                totalPedidos, entregues, cancelados,
                timeline, porDia, top, historico
        );
    }

    // ── CARDÁPIO ───────────────────────────────────────────────────
    @Transactional(readOnly = true)
    public RelatorioCardapioResponse cardapio(LocalDate inicio, LocalDate fim) {
        LocalDate dataInicio = inicio == null ? LocalDate.now().minusDays(30) : inicio;
        LocalDate dataFim    = fim   == null ? LocalDate.now() : fim;
        LocalDateTime inicioDia = dataInicio.atStartOfDay();
        LocalDateTime fimDia    = dataFim.atTime(LocalTime.MAX);

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
        LocalDate dataFim    = fim   == null ? dataInicio : fim;
        LocalDateTime inicioDia = dataInicio.atStartOfDay();
        LocalDateTime fimDia    = dataFim.atTime(LocalTime.MAX);

        Map<Integer, Long> byStatus = buildStatusCountMap(
                pedidoRepository.countsByStatusBetween(inicioDia, fimDia));

        long total      = pedidoRepository.countTotalBetween(inicioDia, fimDia);
        long entregues  = byStatus.getOrDefault(STATUS_ENTREGUE_ID,   0L);
        long cancelados = byStatus.getOrDefault(STATUS_CANCELADO_ID,  0L);
        long recebidos  = byStatus.getOrDefault(STATUS_RECEBIDO_ID,   0L);
        long emPreparo  = byStatus.getOrDefault(STATUS_EM_PREPARO_ID, 0L);
        long prontos    = byStatus.getOrDefault(STATUS_PRONTO_ID,     0L);

        BigDecimal taxaCancelamento = total == 0 ? BigDecimal.ZERO
                : BigDecimal.valueOf(cancelados * 100.0 / total).setScale(1, RoundingMode.HALF_UP);
        BigDecimal taxaEntrega = total == 0 ? BigDecimal.ZERO
                : BigDecimal.valueOf(entregues * 100.0 / total).setScale(1, RoundingMode.HALF_UP);

        long pagos = total - cancelados;
        BigDecimal faturamento = pedidoRepository.faturamentoEntre(inicioDia, fimDia);
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

    private Map<Integer, Long> buildStatusCountMap(List<Object[]> rows) {
        Map<Integer, Long> map = new HashMap<>();
        for (Object[] row : rows) {
            Integer status = ((Number) row[0]).intValue();
            Long count     = ((Number) row[1]).longValue();
            map.put(status, count);
        }
        return map;
    }

    private List<VendasTimelineItem> gerarTimelineDB(LocalDate inicio, LocalDate fim,
                                                      LocalDateTime inicioDia, LocalDateTime fimDia) {
        if (inicio.equals(fim)) {
            List<Object[]> rows = pedidoRepository.timelineByHour(inicioDia, fimDia);
            Map<Integer, Object[]> byHour = new HashMap<>();
            for (Object[] row : rows) {
                byHour.put(((Number) row[0]).intValue(), row);
            }
            return java.util.stream.IntStream.range(0, 24).mapToObj(h -> {
                Object[] row = byHour.get(h);
                BigDecimal valor = row != null ? toBigDecimal(row[2]) : BigDecimal.ZERO;
                long qtd = row != null ? ((Number) row[1]).longValue() : 0L;
                return new VendasTimelineItem(String.format("%02d:00", h), valor, qtd);
            }).toList();
        } else {
            DateTimeFormatter fmt = DateTimeFormatter.ofPattern("dd/MM");
            List<Object[]> rows = pedidoRepository.timelineByDay(inicioDia, fimDia);
            Map<LocalDate, Object[]> byDay = new HashMap<>();
            for (Object[] row : rows) {
                LocalDate d = toLocalDate(row[0]);
                byDay.put(d, row);
            }
            return inicio.datesUntil(fim.plusDays(1)).map(d -> {
                Object[] row = byDay.get(d);
                BigDecimal valor = row != null ? toBigDecimal(row[2]) : BigDecimal.ZERO;
                long qtd = row != null ? ((Number) row[1]).longValue() : 0L;
                return new VendasTimelineItem(d.format(fmt), valor, qtd);
            }).toList();
        }
    }

    private List<VendasPorDiaItem> gerarPorDiaDB(LocalDate inicio, LocalDate fim,
                                                   LocalDateTime inicioDia, LocalDateTime fimDia) {
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("dd/MM/yyyy");
        List<Object[]> rows = pedidoRepository.porDia(inicioDia, fimDia);
        return rows.stream().map(row -> {
            LocalDate d = toLocalDate(row[0]);
            long totalPedidos = ((Number) row[1]).longValue();
            BigDecimal fat    = toBigDecimal(row[2]);
            long pagos        = ((Number) row[3]).longValue();
            BigDecimal ticket = pagos == 0 ? BigDecimal.ZERO
                    : fat.divide(BigDecimal.valueOf(pagos), 2, RoundingMode.HALF_UP);
            return new VendasPorDiaItem(d.format(fmt), totalPedidos, fat, ticket);
        }).toList();
    }

    private VendaHistoricoItem toHistoricoItemFromRow(Object[] row, Map<Long, Integer> mesaMap) {
        Long id             = ((Number) row[0]).longValue();
        LocalDateTime dt    = ((java.sql.Timestamp) row[1]).toLocalDateTime();
        Integer idMesa      = row[2] != null ? ((Number) row[2]).intValue() : null;
        Integer idStatus    = ((Number) row[3]).intValue();
        BigDecimal valor    = toBigDecimal(row[4]);
        long totalItens     = ((Number) row[5]).longValue();
        String origem       = idMesa == null ? "CAIXA" : "MESA";
        Integer numeroMesa  = idMesa == null ? null
                : mesaMap.getOrDefault(idMesa.longValue(), idMesa);
        return new VendaHistoricoItem(id, dt, origem, numeroMesa, toStatusLabel(idStatus), totalItens, valor);
    }

    private BigDecimal toBigDecimal(Object value) {
        if (value == null) return BigDecimal.ZERO;
        if (value instanceof BigDecimal bd) return bd;
        return new BigDecimal(value.toString());
    }

    private LocalDate toLocalDate(Object value) {
        if (value instanceof Date d) return d.toLocalDate();
        return LocalDate.parse(value.toString());
    }

    private String toStatusLabel(Integer idStatus) {
        if (idStatus == null) return "RECEBIDO";
        return switch (idStatus) {
            case STATUS_RECEBIDO_ID   -> "RECEBIDO";
            case STATUS_EM_PREPARO_ID -> "EM_PREPARO";
            case STATUS_PRONTO_ID     -> "PRONTO";
            case STATUS_ENTREGUE_ID   -> "ENTREGUE";
            case STATUS_CANCELADO_ID  -> "CANCELADO";
            default                   -> "RECEBIDO";
        };
    }
}
