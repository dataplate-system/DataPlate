package com.dataplate.service;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.dataplate.entity.Produto;
import com.dataplate.exception.ResourceNotFoundException;
import com.dataplate.repository.ProdutoRepository;

@Service
public class ProdutoService {

    @Autowired
    private ProdutoRepository produtoRepository;

    @Transactional(readOnly = true)
    public List<Produto> listarTodos() {
        return produtoRepository.findByAtivoTrue(PageRequest.of(0, 500)).getContent();
    }

    @Transactional(readOnly = true)
    public Produto obterPorId(Long id) {
        return produtoRepository.findById(id).orElse(null);
    }

    @Transactional
    public Produto salvar(Produto produto) {
        if (produto.getCodigo() != null && produto.getCodigo().isBlank()) {
            produto.setCodigo(null);
        } else if (produto.getCodigo() != null) {
            produto.setCodigo(produto.getCodigo().trim().toUpperCase());
        }

        Produto salvo = produtoRepository.save(produto);
        if (salvo.getCodigo() == null) {
            salvo.setCodigo(String.format("%03d", salvo.getId()));
            salvo = produtoRepository.save(salvo);
        }
        return salvo;
    }

    @Transactional
    public void inativar(Long id) {
        Produto produto = produtoRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Produto não encontrado: " + id));
        produto.setAtivo(false);
        produtoRepository.save(produto);
    }
}
