package com.dataplate.controller;

import java.math.BigDecimal;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.dataplate.entity.Produto;
import com.dataplate.exception.ErrorResponse;
import com.dataplate.service.ProdutoService;
import org.springframework.dao.DataIntegrityViolationException;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/produtos")
@RequiredArgsConstructor
public class ProdutosController {
    private static final Logger logger = LoggerFactory.getLogger(ProdutosController.class);
    private static final BigDecimal PRECO_MAXIMO = new BigDecimal("999999.99");

    private final ProdutoService produtoService;

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
        } catch (DataIntegrityViolationException e) {
            logger.error("Violacao de integridade ao criar produto", e);
            return ResponseEntity.badRequest()
                    .body(new ErrorResponse("Categoria nao encontrada no banco. Verifique se as migrations do Flyway foram executadas corretamente."));
        } catch (Exception e) {
            logger.error("Erro ao criar produto: ", e);
            String mensagemErro = e.getMessage() != null ? e.getMessage() : "Erro desconhecido";
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(new ErrorResponse("Erro ao criar produto: " + mensagemErro));
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
            if (produtoAtualizado.getPreco() != null && produtoAtualizado.getPreco().compareTo(BigDecimal.ZERO) > 0) {
                produtoExistente.setPreco(produtoAtualizado.getPreco());
            }
            if (produtoAtualizado.getDescricao() != null) {
                produtoExistente.setDescricao(produtoAtualizado.getDescricao().trim());
            }
            if (produtoAtualizado.getCodigo() != null) {
                produtoExistente.setCodigo(produtoAtualizado.getCodigo());
            }
            if (produtoAtualizado.getIdCategoria() != null && produtoAtualizado.getIdCategoria() > 0) {
                produtoExistente.setIdCategoria(produtoAtualizado.getIdCategoria());
            }
            if (produtoAtualizado.getImagem() != null) {
                produtoExistente.setImagem(produtoAtualizado.getImagem().trim());
            }
            if (produtoAtualizado.getTempoPreparo() != null) {
                produtoExistente.setTempoPreparo(produtoAtualizado.getTempoPreparo());
            }
            if (produtoAtualizado.getAtivo() != null) {
                produtoExistente.setAtivo(produtoAtualizado.getAtivo());
            }
            if (produtoAtualizado.getDestaque() != null) {
                produtoExistente.setDestaque(produtoAtualizado.getDestaque());
            }

            Produto atualizado = produtoService.salvar(produtoExistente);
            logger.info("Produto atualizado com sucesso. ID: {}", id);

            return ResponseEntity.ok(atualizado);
        } catch (Exception e) {
            logger.error("Erro ao atualizar produto com ID: " + id, e);
            String mensagemErro = e.getMessage() != null ? e.getMessage() : "Erro desconhecido";
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(new ErrorResponse("Erro ao atualizar produto: " + mensagemErro));
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
            String mensagemErro = e.getMessage() != null ? e.getMessage() : "Erro desconhecido";
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(new ErrorResponse("Erro ao deletar produto: " + mensagemErro));
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
        if (produto.getPreco() == null || produto.getPreco().compareTo(BigDecimal.ZERO) <= 0) {
            return "Preco deve ser maior que zero";
        }
        if (produto.getPreco().compareTo(PRECO_MAXIMO) > 0) {
            return "Preco nao pode ser maior que 999999.99";
        }
        return null;
    }
}
