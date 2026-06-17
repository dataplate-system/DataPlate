package com.dataplate.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.dataplate.entity.Produto;

public interface ProdutoRepository extends JpaRepository<Produto, Long> {
    List<Produto> findByAtivoTrue();
    Optional<Produto> findByAtivoTrueAndId(Long id);
}