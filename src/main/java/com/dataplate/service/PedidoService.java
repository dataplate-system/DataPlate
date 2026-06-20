package com.dataplate.service;

import com.dataplate.dto.PedidoCreateRequest;
import com.dataplate.dto.PedidoItemResponse;
import com.dataplate.dto.PedidoResponse;
import com.dataplate.entity.Pedido;
import com.dataplate.entity.PedidoItem;
import com.dataplate.entity.PedidoStatus;
import com.dataplate.entity.PedidoStatusHistorico;
import com.dataplate.entity.Produto;
import com.dataplate.entity.Mesa;
import com.dataplate.exception.BusinessException;
import com.dataplate.exception.ResourceNotFoundException;
import com.dataplate.repository.MesaRepository;
import com.dataplate.repository.PedidoRepository;
import com.dataplate.repository.PedidoStatusHistoricoRepository;
import com.dataplate.repository.ProdutoRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PedidoService {
    private static final Logger log = LoggerFactory.getLogger(PedidoService.class);
    private static final int STATUS_RECEBIDO_ID  = 1;
    private static final int STATUS_SERVIDO_ID   = 6;
    private static final int STATUS_ENTREGUE_ID  = 4;
    private static final int STATUS_CANCELADO_ID = 5;

    private final PedidoRepository pedidoRepository;
    private final ProdutoRepository produtoRepository;
    private final MesaRepository mesaRepository;
    private final PedidoStatusHistoricoRepository historicoRepository;
    private final SimpMessagingTemplate messagingTemplate;

    @Transactional
    public PedidoResponse criar(PedidoCreateRequest request) {
        LocalDateTime now = LocalDateTime.now();
        boolean vendaCaixa = Boolean.TRUE.equals(request.vendaCaixa());
        log.info(
                "Recebida solicitacao para criar pedido. venda_caixa={}, numero_mesa={}, mesa_id={}, forma_pagamento='{}', desconto={}, qtd_itens={}",
                vendaCaixa,
                request.numeroMesa(),
                request.mesaId(),
                request.formaPagamento(),
                request.desconto(),
                request.itens() == null ? 0 : request.itens().size()
        );

        validarCriacao(request, vendaCaixa);
        Mesa mesa = resolverMesa(request, vendaCaixa);

        // Itens são criados antes do pedido para verificar tempoPreparo
        Pedido pedido = Pedido.builder()
                .idMesa(mesa == null ? null : mesa.getId().intValue())
                .idStatus(STATUS_RECEBIDO_ID) // ajustado abaixo após análise dos itens
                .numeroPedido(gerarNumeroPedido())
                .dataHora(now)
                .observacoes(observacoesPedido(request, vendaCaixa))
                .atualizadoEm(now)
                .valorTotal(BigDecimal.ZERO)
                .build();

        List<PedidoItem> itens = request.itens().stream()
                .map(itemRequest -> criarItem(pedido, itemRequest.produtoId(), itemRequest.quantidade()))
                .toList();

        // Venda balcão com itens que não precisam de preparo vai direto para ENTREGUE.
        // Se qualquer item tiver tempoPreparo > 0 (ou nulo, assumindo preparo), vai para a cozinha como RECEBIDO.
        boolean todosInstantaneos = vendaCaixa && itens.stream().allMatch(item -> {
            Integer tp = item.getProduto().getTempoPreparo();
            return tp != null && tp == 0;
        });

        int statusFinal = todosInstantaneos ? STATUS_ENTREGUE_ID : STATUS_RECEBIDO_ID;
        pedido.setIdStatus(statusFinal);

        BigDecimal total = itens.stream()
                .map(this::subtotalDoItem)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        pedido.getItens().addAll(itens);
        pedido.setValorTotal(totalPedido(total, request, vendaCaixa));

        Pedido salvo;
        try {
            salvo = pedidoRepository.save(pedido);
        } catch (DataIntegrityViolationException ex) {
            log.error(
                    "Falha de integridade ao persistir pedido. venda_caixa={}, id_mesa_resolvido={}, numero_mesa={}, mesa_id={}, valor_total={}, erro={}",
                    vendaCaixa,
                    pedido.getIdMesa(),
                    request.numeroMesa(),
                    request.mesaId(),
                    pedido.getValorTotal(),
                    ex.getMostSpecificCause().getMessage(),
                    ex
            );
            throw ex;
        }

        PedidoStatus statusHistorico = todosInstantaneos ? PedidoStatus.ENTREGUE : PedidoStatus.RECEBIDO;
        registrarHistorico(salvo.getId(), statusHistorico);

        Map<Long, Integer> mesaMap = carregarMesaMap();
        PedidoResponse response = toResponse(salvo, mesaMap);
        // VENDA_CAIXA só quando não precisa de preparo — do contrário notifica a cozinha normalmente
        publicarEvento(todosInstantaneos ? "VENDA_CAIXA" : "NOVO_PEDIDO", response);
        log.info("Pedido criado com sucesso. id_pedido={}, venda_caixa={}, id_mesa={}, valor_total={}",
                salvo.getId(), vendaCaixa, salvo.getIdMesa(), salvo.getValorTotal());
        return response;
    }

    @Transactional
    public PedidoResponse atualizarStatus(Long id, PedidoStatus novoStatus, String formaPagamento) {
        Pedido pedido = pedidoRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Pedido nao encontrado: " + id));
        pedido.setIdStatus(toStatusId(novoStatus));

        // Grava forma de pagamento nas observacoes ao marcar como ENTREGUE
        if (novoStatus == PedidoStatus.ENTREGUE
                && formaPagamento != null
                && !formaPagamento.isBlank()) {
            String obs = pedido.getObservacoes() == null ? "" : pedido.getObservacoes().trim();
            String tag = "Pagamento: " + formaPagamento.trim().toUpperCase();
            if (!obs.contains("Pagamento:")) {
                pedido.setObservacoes(obs.isBlank() ? tag : obs + " | " + tag);
            }
        }

        Pedido salvo = pedidoRepository.save(pedido);
        registrarHistorico(salvo.getId(), novoStatus);
        Map<Long, Integer> mesaMap = carregarMesaMap();
        PedidoResponse response = toResponse(salvo, mesaMap);
        publicarEvento("PEDIDO_ATUALIZADO", response);
        return response;
    }

    private void registrarHistorico(Long idPedido, PedidoStatus status) {
        historicoRepository.save(PedidoStatusHistorico.builder()
                .idPedido(idPedido)
                .status(status.name())
                .build());
    }

    @Transactional(readOnly = true)
    public List<PedidoResponse> listar() {
        Map<Long, Integer> mesaMap = carregarMesaMap();
        return pedidoRepository.findAllWithItensOrderByDataHoraDesc()
                .stream().map(p -> toResponse(p, mesaMap)).toList();
    }

    @Transactional(readOnly = true)
    public com.dataplate.dto.PaginatedResponse<PedidoResponse> listar(int page, int size) {
        int safeSize = Math.min(Math.max(size, 1), 200);
        var pageable = org.springframework.data.domain.PageRequest.of(Math.max(page, 0), safeSize);
        var pageResult = pedidoRepository.findAllByOrderByDataHoraDesc(pageable);
        long total = pageResult.getTotalElements();
        List<Long> ids = pageResult.getContent().stream().map(Pedido::getId).toList();
        Map<Long, Integer> mesaMap = carregarMesaMap();
        List<PedidoResponse> content = pedidoRepository.findByIdsWithItens(ids)
                .stream().map(p -> toResponse(p, mesaMap)).toList();
        return new com.dataplate.dto.PaginatedResponse<>(
                content,
                pageResult.getNumber(),
                pageResult.getSize(),
                total,
                pageResult.getTotalPages()
        );
    }

    @Transactional(readOnly = true)
    public List<PedidoResponse> listarPorMesa(Integer numeroMesa) {
        Map<Long, Integer> mesaMap = carregarMesaMap();
        return mesaRepository.findByNumeroAndAtivoTrue(numeroMesa)
                .map(mesa -> pedidoRepository.findByIdMesaWithItensOrderByDataHoraDesc(mesa.getId().intValue())
                        .stream().map(p -> toResponse(p, mesaMap)).toList())
                .orElse(List.of());
    }

    @Transactional(readOnly = true)
    public PedidoResponse obter(Long id) {
        Map<Long, Integer> mesaMap = carregarMesaMap();
        return pedidoRepository.findById(id)
                .map(p -> toResponse(p, mesaMap))
                .orElseThrow(() -> new ResourceNotFoundException("Pedido nao encontrado: " + id));
    }

    private PedidoItem criarItem(Pedido pedido, Long produtoId, Integer quantidade) {
        Produto produto = produtoRepository.findById(produtoId)
                .orElseThrow(() -> new ResourceNotFoundException("Produto nao encontrado: " + produtoId));

        BigDecimal precoUnitario = produto.getPreco();
        BigDecimal quantidadeDecimal = BigDecimal.valueOf(quantidade);
        BigDecimal subtotal = precoUnitario.multiply(quantidadeDecimal);

        return PedidoItem.builder()
                .pedido(pedido)
                .produto(produto)
                .quantidade(quantidadeDecimal)
                .precoUnitario(precoUnitario)
                .subtotal(subtotal)
                .cancelado(false)
                .build();
    }

    private String gerarNumeroPedido() {
        return "P" + System.currentTimeMillis();
    }

    private PedidoResponse toResponse(Pedido pedido, Map<Long, Integer> mesaMap) {
        List<PedidoItemResponse> itens = pedido.getItens().stream()
                .map(item -> new PedidoItemResponse(
                        item.getProduto().getId(),
                        item.getProduto().getNome(),
                        item.getQuantidade().intValue(),
                        item.getPrecoUnitario(),
                        subtotalDoItem(item)
                ))
                .toList();

        return new PedidoResponse(
                pedido.getId(),
                numeroMesa(pedido.getIdMesa(), mesaMap),
                pedido.getIdMesa() == null ? "CAIXA" : "MESA",
                toStatus(pedido.getIdStatus()),
                pedido.getDataHora(),
                pedido.getValorTotal(),
                pedido.getObservacoes(),
                itens
        );
    }

    private Map<Long, Integer> carregarMesaMap() {
        return mesaRepository.findAll().stream()
                .collect(Collectors.toMap(Mesa::getId, Mesa::getNumero));
    }

    private int toStatusId(PedidoStatus status) {
        return switch (status) {
            case RECEBIDO   -> STATUS_RECEBIDO_ID;
            case EM_PREPARO -> 2;
            case PRONTO     -> 3;
            case ENTREGUE   -> STATUS_ENTREGUE_ID;
            case SERVIDO    -> STATUS_SERVIDO_ID;
            case CANCELADO  -> STATUS_CANCELADO_ID;
        };
    }

    private PedidoStatus toStatus(Integer idStatus) {
        return switch (idStatus) {
            case 1 -> PedidoStatus.RECEBIDO;
            case 2 -> PedidoStatus.EM_PREPARO;
            case 3 -> PedidoStatus.PRONTO;
            case 4 -> PedidoStatus.ENTREGUE;
            case 5 -> PedidoStatus.CANCELADO;
            case 6 -> PedidoStatus.SERVIDO;
            default -> PedidoStatus.RECEBIDO;
        };
    }

    private void validarCriacao(PedidoCreateRequest request, boolean vendaCaixa) {
        if (vendaCaixa) {
            if (request.formaPagamento() == null || request.formaPagamento().isBlank()) {
                throw new BusinessException("Forma de pagamento obrigatoria para venda no caixa.");
            }
            return;
        }

        if (request.mesaId() == null && request.numeroMesa() == null) {
            log.warn("Criacao de pedido abortada. Motivo=Mesa nao informada para pedido de salao.");
            throw new BusinessException("Mesa obrigatoria para pedidos de salao.");
        }
    }

    private Mesa resolverMesa(PedidoCreateRequest request, boolean vendaCaixa) {
        if (vendaCaixa) {
            return null;
        }

        if (request.mesaId() != null) {
            return mesaRepository.findById(request.mesaId())
                    .orElseThrow(() -> new ResourceNotFoundException("Mesa nao encontrada: " + request.mesaId()));
        }

        if (request.numeroMesa() == null) {
            throw new ResourceNotFoundException("Mesa nao informada");
        }

        return mesaRepository.findByNumeroAndAtivoTrue(request.numeroMesa())
                .orElseThrow(() -> new ResourceNotFoundException("Mesa nao encontrada: " + request.numeroMesa()));
    }

    private String observacoesPedido(PedidoCreateRequest request, boolean vendaCaixa) {
        String obs = request.observacoes() == null ? "" : request.observacoes().trim();
        if (!vendaCaixa) {
            return obs.isBlank() ? null : obs;
        }

        String formaPagamento = request.formaPagamento() == null ? "NAO_INFORMADO" : request.formaPagamento().trim();
        String prefixo = "Venda no caixa - pagamento: " + formaPagamento;
        return obs.isBlank() ? prefixo : prefixo + " - " + obs;
    }

    private BigDecimal totalPedido(BigDecimal totalItens, PedidoCreateRequest request, boolean vendaCaixa) {
        if (!vendaCaixa || request.desconto() == null || request.desconto().compareTo(BigDecimal.ZERO) <= 0) {
            return totalItens;
        }

        BigDecimal desconto = request.desconto().min(totalItens);
        return totalItens.subtract(desconto);
    }

    private BigDecimal subtotalDoItem(PedidoItem item) {
        if (item.getSubtotal() != null) {
            return item.getSubtotal();
        }
        return item.getPrecoUnitario().multiply(item.getQuantidade());
    }

    private Integer numeroMesa(Integer idMesa, Map<Long, Integer> mesaMap) {
        if (idMesa == null) return null;
        return mesaMap.getOrDefault(idMesa.longValue(), idMesa);
    }

    private void publicarEvento(String type, PedidoResponse pedido) {
        Map<String, Object> payload = Map.of(
                "type", type,
                "pedido", pedido
        );
        messagingTemplate.convertAndSend("/topic/pedidos", (Object) payload);
    }
}
