package com.dataplate.controller;

import com.dataplate.entity.Produto;
import com.dataplate.exception.ErrorResponse;
import com.dataplate.service.ProdutoService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/produtos")
@CrossOrigin(origins = "*")
public class ProdutosController {
    private static final Logger logger = LoggerFactory.getLogger(ProdutosController.class);

    @Autowired
    private ProdutoService produtoService;

    @GetMapping
    public ResponseEntity<List<Produto>> listar() {
        try {
            logger.info("Listando todos os produtos");
            return ResponseEntity.ok(produtoService.listarTodos());
        } catch (Exception e) {
            logger.error("Erro ao listar produtos", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<Produto> obterPorId(@PathVariable Long id) {
        try {
            logger.info("Obtendo produto com ID: {}", id);

            if (id == null || id <= 0) {
                logger.warn("ID invalido: {}", id);
                return ResponseEntity.badRequest().build();
            }

            Produto produto = produtoService.obterPorId(id);
            if (produto == null) {
                logger.warn("Produto nao encontrado com ID: {}", id);
                return ResponseEntity.notFound().build();
            }

            return ResponseEntity.ok(produto);
        } catch (Exception e) {
            logger.error("Erro ao obter produto com ID: " + id, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @PostMapping
    public ResponseEntity<?> criar(@RequestBody Produto produto) {
        try {
            logger.info("Criando novo produto: {}", produto != null ? produto.getNome() : null);

            String erro = validarProduto(produto);
            if (erro != null) {
                logger.warn("Validacao falhou: {}", erro);
                return ResponseEntity.badRequest().body(new ErrorResponse(erro));
            }

            Produto salvo = produtoService.salvar(produto);
            logger.info("Produto criado com sucesso. ID: {}", salvo.getId());

            return ResponseEntity.status(HttpStatus.CREATED).body(salvo);
        } catch (Exception e) {
            logger.error("Erro ao criar produto", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(new ErrorResponse("Erro ao criar produto"));
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> atualizar(@PathVariable Long id, @RequestBody Produto produtoAtualizado) {
        try {
            logger.info("Atualizando produto com ID: {}", id);

            if (id == null || id <= 0) {
                logger.warn("ID invalido: {}", id);
                return ResponseEntity.badRequest().body(new ErrorResponse("ID invalido"));
            }

            Produto produtoExistente = produtoService.obterPorId(id);
            if (produtoExistente == null) {
                logger.warn("Produto nao encontrado para atualizar. ID: {}", id);
                return ResponseEntity.notFound().build();
            }

            if (produtoAtualizado.getNome() != null && !produtoAtualizado.getNome().isEmpty()) {
                produtoExistente.setNome(produtoAtualizado.getNome().trim());
            }
            if (produtoAtualizado.getPreco() != null && produtoAtualizado.getPreco() > 0) {
                produtoExistente.setPreco(produtoAtualizado.getPreco());
            }
            if (produtoAtualizado.getDescricao() != null) {
                produtoExistente.setDescricao(produtoAtualizado.getDescricao().trim());
            }

            Produto atualizado = produtoService.salvar(produtoExistente);
            logger.info("Produto atualizado com sucesso. ID: {}", id);

            return ResponseEntity.ok(atualizado);
        } catch (Exception e) {
            logger.error("Erro ao atualizar produto com ID: " + id, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(new ErrorResponse("Erro ao atualizar produto"));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deletar(@PathVariable Long id) {
        try {
            logger.info("Deletando produto com ID: {}", id);

            if (id == null || id <= 0) {
                logger.warn("ID invalido para deletar: {}", id);
                return ResponseEntity.badRequest().body(new ErrorResponse("ID invalido"));
            }

            Produto produto = produtoService.obterPorId(id);
            if (produto == null) {
                logger.warn("Produto nao encontrado para deletar. ID: {}", id);
                return ResponseEntity.notFound().build();
            }

            produtoService.deletar(id);
            logger.info("Produto deletado com sucesso. ID: {}", id);

            return ResponseEntity.noContent().build();
        } catch (Exception e) {
            logger.error("Erro ao deletar produto com ID: " + id, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(new ErrorResponse("Erro ao deletar produto"));
        }
    }

    private String validarProduto(Produto produto) {
        if (produto == null) {
            return "Produto nao pode ser nulo";
        }
        if (produto.getNome() == null || produto.getNome().trim().isEmpty()) {
            return "Nome do produto e obrigatorio";
        }
        if (produto.getNome().length() > 255) {
            return "Nome do produto nao pode ter mais de 255 caracteres";
        }
        if (produto.getIdCategoria() == null || produto.getIdCategoria() <= 0) {
            return "Categoria do produto e obrigatoria";
        }
        if (produto.getPreco() == null || produto.getPreco() <= 0) {
            return "Preco deve ser maior que zero";
        }
        if (produto.getPreco() > 999999.99) {
            return "Preco nao pode ser maior que 999999.99";
        }
        return null;
    }
}
