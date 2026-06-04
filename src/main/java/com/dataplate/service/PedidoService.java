package com.dataplate.service;

import com.dataplate.dto.PedidoCreateRequest;
import com.dataplate.dto.PedidoItemResponse;
import com.dataplate.dto.PedidoResponse;
import com.dataplate.entity.Pedido;
import com.dataplate.entity.PedidoItem;
import com.dataplate.entity.PedidoStatus;
import com.dataplate.entity.Produto;
import com.dataplate.entity.Mesa;
import com.dataplate.exception.ResourceNotFoundException;
import com.dataplate.repository.MesaRepository;
import com.dataplate.repository.PedidoRepository;
import com.dataplate.repository.ProdutoRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class PedidoService {
    private static final int STATUS_RECEBIDO_ID = 1;
    private static final int STATUS_CANCELADO_ID = 5;

    private final PedidoRepository pedidoRepository;
    private final ProdutoRepository produtoRepository;
    private final MesaRepository mesaRepository;
    private final SimpMessagingTemplate messagingTemplate;

    @Transactional
    public PedidoResponse criar(PedidoCreateRequest request) {
        LocalDateTime now = LocalDateTime.now();
        Mesa mesa = resolverMesa(request);
        Pedido pedido = Pedido.builder()
                .idMesa(mesa.getId().intValue())
                .idStatus(STATUS_RECEBIDO_ID)
                .numeroPedido(gerarNumeroPedido())
                .dataHora(now)
                .atualizadoEm(now)
                .valorTotal(BigDecimal.ZERO)
                .build();

        List<PedidoItem> itens = request.itens().stream()
                .map(itemRequest -> criarItem(pedido, itemRequest.produtoId(), itemRequest.quantidade()))
                .toList();

        BigDecimal total = itens.stream()
                .map(this::subtotalDoItem)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        pedido.getItens().addAll(itens);
        pedido.setValorTotal(total);

        PedidoResponse response = toResponse(pedidoRepository.save(pedido));
        publicarEvento("NOVO_PEDIDO", response);
        return response;
    }

    @Transactional
    public PedidoResponse atualizarStatus(Long id, PedidoStatus novoStatus) {
        Pedido pedido = pedidoRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Pedido nao encontrado: " + id));
        pedido.setIdStatus(toStatusId(novoStatus));
        PedidoResponse response = toResponse(pedidoRepository.save(pedido));
        publicarEvento("PEDIDO_ATUALIZADO", response);
        return response;
    }

    @Transactional(readOnly = true)
    public List<PedidoResponse> listar() {
        return pedidoRepository.findAllByOrderByDataHoraDesc()
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public PedidoResponse obter(Long id) {
        return pedidoRepository.findById(id)
                .map(this::toResponse)
                .orElseThrow(() -> new ResourceNotFoundException("Pedido nao encontrado: " + id));
    }

    private PedidoItem criarItem(Pedido pedido, Long produtoId, Integer quantidade) {
        Produto produto = produtoRepository.findById(produtoId)
                .orElseThrow(() -> new ResourceNotFoundException("Produto nao encontrado: " + produtoId));

        BigDecimal precoUnitario = BigDecimal.valueOf(produto.getPreco());
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

    private PedidoResponse toResponse(Pedido pedido) {
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
                numeroMesa(pedido.getIdMesa()),
                toStatus(pedido.getIdStatus()),
                pedido.getDataHora(),
                pedido.getValorTotal(),
                itens
        );
    }

    private int toStatusId(PedidoStatus status) {
        return switch (status) {
            case RECEBIDO -> STATUS_RECEBIDO_ID;
            case EM_PREPARO -> 2;
            case PRONTO -> 3;
            case ENTREGUE -> 4;
            case CANCELADO -> STATUS_CANCELADO_ID;
        };
    }

    private PedidoStatus toStatus(Integer idStatus) {
        return switch (idStatus) {
            case STATUS_RECEBIDO_ID -> PedidoStatus.RECEBIDO;
            case 2 -> PedidoStatus.EM_PREPARO;
            case 3 -> PedidoStatus.PRONTO;
            case 4 -> PedidoStatus.ENTREGUE;
            case STATUS_CANCELADO_ID -> PedidoStatus.CANCELADO;
            default -> PedidoStatus.RECEBIDO;
        };
    }

    private Mesa resolverMesa(PedidoCreateRequest request) {
        if (request.mesaId() != null) {
            return mesaRepository.findById(request.mesaId())
                    .orElseThrow(() -> new ResourceNotFoundException("Mesa nao encontrada: " + request.mesaId()));
        }

        return mesaRepository.findByNumeroAndAtivoTrue(request.numeroMesa())
                .orElseThrow(() -> new ResourceNotFoundException("Mesa nao encontrada: " + request.numeroMesa()));
    }

    private BigDecimal subtotalDoItem(PedidoItem item) {
        if (item.getSubtotal() != null) {
            return item.getSubtotal();
        }
        return item.getPrecoUnitario().multiply(item.getQuantidade());
    }

    private Integer numeroMesa(Integer idMesa) {
        if (idMesa == null) return null;
        return mesaRepository.findById(idMesa.longValue())
                .map(Mesa::getNumero)
                .orElse(idMesa);
    }

    private void publicarEvento(String type, PedidoResponse pedido) {
        Map<String, Object> payload = Map.of(
                "type", type,
                "pedido", pedido
        );
        messagingTemplate.convertAndSend("/topic/pedidos", (Object) payload);
    }
}
