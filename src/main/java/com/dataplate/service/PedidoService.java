package com.dataplate.service;

import com.dataplate.dto.PedidoCreateRequest;
import com.dataplate.dto.PedidoItemResponse;
import com.dataplate.dto.PedidoResponse;
import com.dataplate.entity.Pedido;
import com.dataplate.entity.PedidoItem;
import com.dataplate.entity.PedidoStatus;
import com.dataplate.entity.Produto;
import com.dataplate.exception.ResourceNotFoundException;
import com.dataplate.repository.PedidoRepository;
import com.dataplate.repository.ProdutoRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class PedidoService {
    private static final int STATUS_RECEBIDO_ID = 1;
    private static final int STATUS_CANCELADO_ID = 5;

    private final PedidoRepository pedidoRepository;
    private final ProdutoRepository produtoRepository;

    @Transactional
    public PedidoResponse criar(PedidoCreateRequest request) {
        LocalDateTime now = LocalDateTime.now();
        Pedido pedido = Pedido.builder()
                .idMesa(request.numeroMesa())
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
                .map(PedidoItem::getSubtotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        pedido.getItens().addAll(itens);
        pedido.setValorTotal(total);

        return toResponse(pedidoRepository.save(pedido));
    }

    @Transactional(readOnly = true)
    public List<PedidoResponse> listar() {
        return pedidoRepository.findTop10ByOrderByDataHoraDesc()
                .stream()
                .map(this::toResponse)
                .toList();
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
                        item.getSubtotal()
                ))
                .toList();

        return new PedidoResponse(
                pedido.getId(),
                pedido.getIdMesa(),
                toStatus(pedido.getIdStatus()),
                pedido.getDataHora(),
                pedido.getValorTotal(),
                itens
        );
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
}
