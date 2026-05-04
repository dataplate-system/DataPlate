package com.dataplate.repository;

import com.dataplate.entity.ProdutoInsumo;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ProdutoInsumoRepository extends JpaRepository<ProdutoInsumo, Long> {
    List<ProdutoInsumo> findByProdutoId(Long produtoId);
    void deleteByProdutoId(Long produtoId);
}
