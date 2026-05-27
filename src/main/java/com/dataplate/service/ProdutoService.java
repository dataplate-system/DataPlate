package com.dataplate.service;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.dataplate.dto.ProdutoResponse;
import com.dataplate.entity.Produto;
import com.dataplate.repository.ProdutoRepository;

@Service
public class ProdutoService {
    
    private static final Logger logger = LoggerFactory.getLogger(ProdutoService.class);
    
    @Autowired
    private ProdutoRepository produtoRepository;
    
    // ========== ADMIN - Gerenciamento Completo ==========
    
    @Transactional
    public ProdutoResponse criar(Produto produto) {
        logger.info("Criando novo produto: {}", produto.getNome());
        validarProduto(produto);
        gerarCodigoProduto(produto);
        
        Produto salvo = produtoRepository.save(produto);
        logger.info("Produto criado com ID: {}", salvo.getId());
        return toResponse(salvo);
    }
    
    @Transactional
    public ProdutoResponse atualizar(Long id, Produto produtoAtualizado) {
        logger.info("Atualizando produto com ID: {}", id);
        
        Produto produto = produtoRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("Produto não encontrado: " + id));
        
        // Atualiza apenas os campos que foram fornecidos
        if (produtoAtualizado.getNome() != null && !produtoAtualizado.getNome().isEmpty()) {
            produto.setNome(produtoAtualizado.getNome().trim());
        }
        if (produtoAtualizado.getDescricao() != null) {
            produto.setDescricao(produtoAtualizado.getDescricao().trim());
        }
        if (produtoAtualizado.getPreco() != null && produtoAtualizado.getPreco() > 0) {
            produto.setPreco(produtoAtualizado.getPreco());
        }
        if (produtoAtualizado.getImagem() != null) {
            produto.setImagem(produtoAtualizado.getImagem().trim());
        }
        if (produtoAtualizado.getIdCategoria() != null && produtoAtualizado.getIdCategoria() > 0) {
            produto.setIdCategoria(produtoAtualizado.getIdCategoria());
        }
        if (produtoAtualizado.getTempoPreparo() != null) {
            produto.setTempoPreparo(produtoAtualizado.getTempoPreparo());
        }
        if (produtoAtualizado.getAtivo() != null) {
            produto.setAtivo(produtoAtualizado.getAtivo());
        }
        if (produtoAtualizado.getDestaque() != null) {
            produto.setDestaque(produtoAtualizado.getDestaque());
        }
        
        Produto atualizado = produtoRepository.save(produto);
        logger.info("Produto atualizado com sucesso. ID: {}", id);
        return toResponse(atualizado);
    }
    
    @Transactional
    public void ativar(Long id) {
        logger.info("Ativando produto: {}", id);
        Produto produto = produtoRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("Produto não encontrado: " + id));
        produto.setAtivo(true);
        produtoRepository.save(produto);
    }
    
    @Transactional
    public void desativar(Long id) {
        logger.info("Desativando produto: {}", id);
        Produto produto = produtoRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("Produto não encontrado: " + id));
        produto.setAtivo(false);
        produtoRepository.save(produto);
    }
    
    @Transactional
    public void deletar(Long id) {
        logger.info("Deletando produto com ID: {}", id);
        if (!produtoRepository.existsById(id)) {
            throw new RuntimeException("Produto não encontrado: " + id);
        }
        produtoRepository.deleteById(id);
    }
    
    @Transactional(readOnly = true)
    public List<ProdutoResponse> listarTodos() {
        logger.info("Listando todos os produtos (admin)");
        return produtoRepository.findAllByOrderByNomeAsc()
            .stream()
            .map(this::toResponse)
            .toList();
    }
    
    @Transactional(readOnly = true)
    public ProdutoResponse obterPorIdAdmin(Long id) {
        logger.info("Admin consultando produto: {}", id);
        Produto produto = produtoRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("Produto não encontrado: " + id));
        return toResponse(produto);
    }
    
    // ========== CLIENTE - Visualização (Somente ATIVOS) ==========
    
    @Transactional(readOnly = true)
    public List<ProdutoResponse> listarCardapio() {
        logger.info("Cliente acessando cardápio");
        return produtoRepository.findByAtivoTrueOrderByNomeAsc()
            .stream()
            .map(this::toResponse)
            .toList();
    }
    
    @Transactional(readOnly = true)
    public List<ProdutoResponse> listarPorCategoria(Long idCategoria) {
        logger.info("Cliente listando cardápio da categoria: {}", idCategoria);
        return produtoRepository.findByAtivoTrueAndIdCategoriaOrderByNomeAsc(idCategoria)
            .stream()
            .map(this::toResponse)
            .toList();
    }
    
    @Transactional(readOnly = true)
    public List<ProdutoResponse> listarDestaques() {
        logger.info("Cliente acessando produtos em destaque");
        return produtoRepository.findByAtivoTrueAndDestaqueOrderByNomeAsc(true)
            .stream()
            .map(this::toResponse)
            .toList();
    }
    
    @Transactional(readOnly = true)
    public ProdutoResponse obterDetalhes(Long id) {
        logger.info("Cliente consultando produto: {}", id);
        Produto produto = produtoRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("Produto não encontrado: " + id));
        
        // Verifica se o produto está ativo
        if (!produto.getAtivo()) {
            throw new RuntimeException("Produto não disponível no cardápio");
        }
        
        return toResponse(produto);
    }
    
    @Transactional(readOnly = true)
    public List<ProdutoResponse> buscar(String termo) {
        logger.info("Cliente buscando produtos: {}", termo);
        
        if (termo == null || termo.trim().isEmpty()) {
            return List.of();
        }
        
        String termoBusca = termo.trim().toLowerCase();
        return produtoRepository.buscarProdutosAtivos(termoBusca)
            .stream()
            .map(this::toResponse)
            .toList();
    }
    
    // ========== VALIDAÇÕES E UTILS ==========
    
    private void validarProduto(Produto produto) {
        if (produto == null) {
            throw new IllegalArgumentException("Produto não pode ser nulo");
        }
        if (produto.getNome() == null || produto.getNome().trim().isEmpty()) {
            throw new IllegalArgumentException("Nome do produto é obrigatório");
        }
        if (produto.getNome().length() > 255) {
            throw new IllegalArgumentException("Nome do produto não pode ter mais de 255 caracteres");
        }
        if (produto.getIdCategoria() == null || produto.getIdCategoria() <= 0) {
            throw new IllegalArgumentException("Categoria do produto é obrigatória");
        }
        if (produto.getPreco() == null || produto.getPreco() <= 0) {
            throw new IllegalArgumentException("Preço deve ser maior que zero");
        }
        if (produto.getPreco() > 999999.99) {
            throw new IllegalArgumentException("Preço não pode ser maior que 999999.99");
        }
    }
    
    private void gerarCodigoProduto(Produto produto) {
        // Se o código foi fornecido, normaliza-o
        if (produto.getCodigo() != null && !produto.getCodigo().isBlank()) {
            produto.setCodigo(produto.getCodigo().trim().toUpperCase());
        }
        // Se não tiver código, será gerado após a inserção com o ID
    }
    
    @Transactional
    public void normalizarCodigos() {
        logger.info("Normalizando códigos de produtos sem código");
        List<Produto> produtosSemCodigo = produtoRepository.findByCodigo(null);
        
        for (Produto p : produtosSemCodigo) {
            p.setCodigo("PRO-" + String.format("%05d", p.getId()));
            produtoRepository.save(p);
        }
        
        logger.info("Códigos normalizados: {} produtos", produtosSemCodigo.size());
    }
    
    private ProdutoResponse toResponse(Produto produto) {
        return new ProdutoResponse(
            produto.getId(),
            produto.getCodigo(),
            produto.getIdCategoria(),
            produto.getNome(),
            produto.getDescricao(),
            produto.getPreco(),
            produto.getImagem(),
            produto.getAtivo(),
            produto.getTempoPreparo(),
            produto.getDestaque(),
            produto.getCriadoEm()
        );
    }
}
