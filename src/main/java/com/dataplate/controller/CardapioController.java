package com.dataplate.controller;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.dataplate.dto.ProdutoResponse;
import com.dataplate.service.ProdutoService;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping({"/api/cardapio", "/api/menu"})
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class CardapioController {
    
    private static final Logger logger = LoggerFactory.getLogger(CardapioController.class);
    
    private final ProdutoService produtoService;
    
    @GetMapping
    public ResponseEntity<List<ProdutoResponse>> listarCardapio() {
        try {
            logger.info("Cliente acessando cardápio completo");
            List<ProdutoResponse> produtos = produtoService.listarCardapio();
            return ResponseEntity.ok(produtos);
        } catch (Exception e) {
            logger.error("Erro ao listar cardápio", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
    
    @GetMapping("/categoria/{idCategoria}")
    public ResponseEntity<List<ProdutoResponse>> listarPorCategoria(@PathVariable Long idCategoria) {
        try {
            logger.info("Cliente listando cardápio da categoria: {}", idCategoria);
            
            if (idCategoria == null || idCategoria <= 0) {
                return ResponseEntity.badRequest().build();
            }
            
            List<ProdutoResponse> produtos = produtoService.listarPorCategoria(idCategoria);
            return ResponseEntity.ok(produtos);
        } catch (Exception e) {
            logger.error("Erro ao listar por categoria", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
    
    @GetMapping("/destaque")
    public ResponseEntity<List<ProdutoResponse>> listarDestaques() {
        try {
            logger.info("Cliente acessando produtos em destaque");
            List<ProdutoResponse> produtos = produtoService.listarDestaques();
            return ResponseEntity.ok(produtos);
        } catch (Exception e) {
            logger.error("Erro ao listar destaques", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
    
    @GetMapping("/{id}")
    public ResponseEntity<ProdutoResponse> obterDetalhes(@PathVariable Long id) {
        try {
            logger.info("Cliente consultando produto: {}", id);
            
            if (id == null || id <= 0) {
                return ResponseEntity.badRequest().build();
            }
            
            ProdutoResponse produto = produtoService.obterDetalhes(id);
            return ResponseEntity.ok(produto);
        } catch (RuntimeException e) {
            logger.warn("Produto não encontrado ou não disponível: {}", id);
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            logger.error("Erro ao obter detalhes do produto", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
    
    @GetMapping("/busca")
    public ResponseEntity<List<ProdutoResponse>> buscar(@RequestParam(required = false) String termo) {
        try {
            logger.info("Cliente buscando produtos: {}", termo);
            
            if (termo == null || termo.trim().isEmpty()) {
                return ResponseEntity.ok(List.of());
            }
            
            List<ProdutoResponse> produtos = produtoService.buscar(termo);
            return ResponseEntity.ok(produtos);
        } catch (Exception e) {
            logger.error("Erro ao buscar produtos", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
}
