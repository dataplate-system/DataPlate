package com.dataplate.service;

import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import com.dataplate.entity.Produto;
import com.dataplate.repository.ProdutoRepository;

@Service
public class ProdutoService {
    
    @Autowired
    private ProdutoRepository produtoRepository;
    
    public List<Produto> listarTodos() {
        return produtoRepository.findAll();
    }
    
    public Produto obterPorId(Long id) {
        return produtoRepository.findById(id).orElse(null);
    }
    
    public Produto salvar(Produto produto) {
        if (produto.getCodigo() != null && produto.getCodigo().isBlank()) {
            produto.setCodigo(null);
        } else if (produto.getCodigo() != null) {
            produto.setCodigo(produto.getCodigo().trim().toUpperCase());
        }

        Produto salvo = produtoRepository.save(produto);
        if (salvo.getCodigo() == null) {
            salvo.setCodigo("PRO-" + String.format("%03d", salvo.getId()));
            salvo = produtoRepository.save(salvo);
        }
        return salvo;
    }
    
    public void deletar(Long id) {
        produtoRepository.deleteById(id);
    }
}
