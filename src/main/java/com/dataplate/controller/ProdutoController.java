package com.dataplate.controller;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.dataplate.dto.ErrorResponse;
import com.dataplate.dto.ProdutoResponse;
import com.dataplate.entity.Produto;
import com.dataplate.service.ProdutoService;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/produtos")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class ProdutoController {
    
    private static final Logger logger = LoggerFactory.getLogger(ProdutoController.class);
    
    private final ProdutoService produtoService;
    
    // ========== CLIENTE - Endpoints públicos (Cardápio) ==========
    
    /**
     * GET /api/produtos
     * Lista TODOS os produtos ATIVOS (cardápio do cliente)
     */
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
    
    /**
     * GET /api/produtos/categoria/{idCategoria}
     * Lista produtos ATIVOS de uma categoria específica
     */
    @GetMapping("/categoria/{idCategoria}")
    public ResponseEntity<List<ProdutoResponse>> listarPorCategoria(@PathVariable Long idCategoria) {
        try {
            logger.info("Cliente listando categoria: {}", idCategoria);
            
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
    
    /**
     * GET /api/produtos/destaque
     * Lista produtos em DESTAQUE (promoções)
     */
    @GetMapping("/destaque")
    public ResponseEntity<List<ProdutoResponse>> listarDestaques() {
        try {
            logger.info("Cliente acessando destaques");
            List<ProdutoResponse> produtos = produtoService.listarDestaques();
            return ResponseEntity.ok(produtos);
        } catch (Exception e) {
            logger.error("Erro ao listar destaques", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
    
    /**
     * GET /api/produtos/busca?termo=pizza
     * Busca produtos ATIVOS por termo (nome ou descrição)
     */
    @GetMapping("/busca")
    public ResponseEntity<List<ProdutoResponse>> buscar(@RequestParam(required = false) String termo) {
        try {
            logger.info("Cliente buscando: {}", termo);
            
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
    
    /**
     * GET /api/produtos/{id}
     * Obtém detalhes de um produto ATIVO (cliente)
     */
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
    
    // ========== ADMIN - Endpoints protegidos ==========
    
    /**
     * POST /api/produtos
     * Criar novo produto (apenas admin)
     */
    @PostMapping
    public ResponseEntity<?> criar(@RequestBody Produto produto) {
        try {
            if (produto == null) {
                return ResponseEntity.badRequest()
                        .body(new ErrorResponse("Corpo da requisicao e obrigatorio"));
            }

            logger.info("Admin criando novo produto: {}", produto.getNome());
            ProdutoResponse novoProduto = produtoService.criar(produto);
            return ResponseEntity.status(HttpStatus.CREATED).body(novoProduto);
        } catch (IllegalArgumentException e) {
            logger.warn("Validação falhou: {}", e.getMessage());
            return ResponseEntity.badRequest()
                    .body(new ErrorResponse("Validação: " + e.getMessage()));
        } catch (Exception e) {
            logger.error("Erro ao criar produto", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(new ErrorResponse("Erro ao criar produto: " + e.getMessage()));
        }
    }
    
    /**
     * PUT /api/produtos/{id}
     * Atualizar produto (apenas admin)
     */
    @PutMapping("/{id}")
    public ResponseEntity<?> atualizar(@PathVariable Long id, @RequestBody Produto produtoAtualizado) {
        try {
            logger.info("Admin atualizando produto: {}", id);
            
            if (id == null || id <= 0) {
                return ResponseEntity.badRequest()
                        .body(new ErrorResponse("ID inválido"));
            }
            if (produtoAtualizado == null) {
                return ResponseEntity.badRequest()
                        .body(new ErrorResponse("Corpo da requisicao e obrigatorio"));
            }
            
            ProdutoResponse produto = produtoService.atualizar(id, produtoAtualizado);
            return ResponseEntity.ok(produto);
        } catch (RuntimeException e) {
            logger.warn("Produto não encontrado: {}", id);
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            logger.error("Erro ao atualizar produto", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(new ErrorResponse("Erro ao atualizar: " + e.getMessage()));
        }
    }
    
    /**
     * DELETE /api/produtos/{id}
     * Deletar produto (apenas admin)
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<?> deletar(@PathVariable Long id) {
        try {
            logger.info("Admin deletando produto: {}", id);
            
            if (id == null || id <= 0) {
                return ResponseEntity.badRequest()
                        .body(new ErrorResponse("ID inválido"));
            }
            
            produtoService.deletar(id);
            return ResponseEntity.noContent().build();
        } catch (RuntimeException e) {
            logger.warn("Produto não encontrado: {}", id);
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            logger.error("Erro ao deletar produto", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(new ErrorResponse("Erro ao deletar: " + e.getMessage()));
        }
    }
    
    /**
     * PATCH /api/produtos/{id}/ativar
     * Ativar produto (soft-delete reverso)
     */
    @PatchMapping("/{id}/ativar")
    public ResponseEntity<?> ativar(@PathVariable Long id) {
        try {
            logger.info("Admin ativando produto: {}", id);
            produtoService.ativar(id);
            return ResponseEntity.ok().build();
        } catch (RuntimeException e) {
            logger.warn("Produto não encontrado: {}", id);
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            logger.error("Erro ao ativar produto", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
    
    /**
     * PATCH /api/produtos/{id}/desativar
     * Desativar produto (soft-delete)
     */
    @PatchMapping("/{id}/desativar")
    public ResponseEntity<?> desativar(@PathVariable Long id) {
        try {
            logger.info("Admin desativando produto: {}", id);
            produtoService.desativar(id);
            return ResponseEntity.ok().build();
        } catch (RuntimeException e) {
            logger.warn("Produto não encontrado: {}", id);
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            logger.error("Erro ao desativar produto", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
    
    /**
     * GET /api/produtos/admin/listar-todos
     * Listar TODOS os produtos (admin)
     */
    @GetMapping("/admin/listar-todos")
    public ResponseEntity<List<ProdutoResponse>> listarTodos() {
        try {
            logger.info("Admin listando TODOS os produtos");
            List<ProdutoResponse> produtos = produtoService.listarTodos();
            return ResponseEntity.ok(produtos);
        } catch (Exception e) {
            logger.error("Erro ao listar todos os produtos", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
    
    /**
     * GET /api/produtos/admin/{id}
     * Obter um produto (admin vê tudo: ativos e inativos)
     */
    @GetMapping("/admin/{id}")
    public ResponseEntity<ProdutoResponse> obterPorIdAdmin(@PathVariable Long id) {
        try {
            logger.info("Admin consultando produto: {}", id);
            
            if (id == null || id <= 0) {
                return ResponseEntity.badRequest().build();
            }
            
            ProdutoResponse produto = produtoService.obterPorIdAdmin(id);
            return ResponseEntity.ok(produto);
        } catch (RuntimeException e) {
            logger.warn("Produto não encontrado: {}", id);
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            logger.error("Erro ao obter produto", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
}
