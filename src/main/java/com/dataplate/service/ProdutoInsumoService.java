package com.dataplate.service;

import com.dataplate.dto.ProdutoInsumoRequest;
import com.dataplate.dto.ProdutoInsumoResponse;
import com.dataplate.entity.Insumo;
import com.dataplate.entity.Produto;
import com.dataplate.entity.ProdutoInsumo;
import com.dataplate.exception.ResourceNotFoundException;
import com.dataplate.repository.InsumoRepository;
import com.dataplate.repository.ProdutoInsumoRepository;
import com.dataplate.repository.ProdutoRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ProdutoInsumoService {

    private final ProdutoInsumoRepository repository;
    private final ProdutoRepository produtoRepository;
    private final InsumoRepository insumoRepository;

    @Transactional(readOnly = true)
    public List<ProdutoInsumoResponse> listar(Long produtoId) {
        return repository.findByProdutoId(produtoId).stream()
                .map(this::toResponse).toList();
    }

    @Transactional
    public ProdutoInsumoResponse adicionar(Long produtoId, ProdutoInsumoRequest req) {
        Produto produto = produtoRepository.findById(produtoId)
                .orElseThrow(() -> new ResourceNotFoundException("Produto nao encontrado: " + produtoId));
        Insumo insumo = insumoRepository.findById(req.insumoId())
                .orElseThrow(() -> new ResourceNotFoundException("Insumo nao encontrado: " + req.insumoId()));

        ProdutoInsumo pi = ProdutoInsumo.builder()
                .produto(produto)
                .insumo(insumo)
                .quantidade(req.quantidade())
                .build();
        return toResponse(repository.save(pi));
    }

    @Transactional
    public void remover(Long produtoId, Long insumoId) {
        repository.deleteByProdutoIdAndInsumoId(produtoId, insumoId);
    }

    private ProdutoInsumoResponse toResponse(ProdutoInsumo pi) {
        return new ProdutoInsumoResponse(
                pi.getId(),
                pi.getProduto().getId(),
                pi.getInsumo().getId(),
                pi.getInsumo().getNome(),
                pi.getInsumo().getUnidade(),
                pi.getQuantidade()
        );
    }
}
