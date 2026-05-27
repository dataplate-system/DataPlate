package com.dataplate.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.dataplate.entity.Produto;

@Repository
public interface ProdutoRepository extends JpaRepository<Produto, Long> {
    
    // ========== ADMIN - Todos os produtos ==========
    List<Produto> findAllByOrderByNomeAsc();
    
    // ========== CLIENTE - Produtos ATIVOS ==========
    List<Produto> findByAtivoTrueOrderByNomeAsc();
    
    List<Produto> findByAtivoTrueAndIdCategoriaOrderByNomeAsc(Long idCategoria);
    
    List<Produto> findByAtivoTrueAndDestaqueOrderByNomeAsc(Boolean destaque);
    
    // ========== BUSCA ==========
    @Query("SELECT p FROM Produto p WHERE p.ativo = true AND " +
           "(LOWER(p.nome) LIKE LOWER(CONCAT('%', :termo, '%')) OR " +
           "LOWER(p.descricao) LIKE LOWER(CONCAT('%', :termo, '%'))) " +
           "ORDER BY p.nome ASC")
    List<Produto> buscarProdutosAtivos(@Param("termo") String termo);
    
    // ========== ADMIN - Gerenciamento ==========
    List<Produto> findByAtivoFalseOrderByNomeAsc();
    
    List<Produto> findByCodigo(String codigo);
    
    Optional<Produto> findByCodigoAndAtivoTrue(String codigo);
    
    // ========== VERIFICAÇÕES ==========
    boolean existsByCodigo(String codigo);
}