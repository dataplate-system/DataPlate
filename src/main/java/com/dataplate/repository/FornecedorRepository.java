package com.dataplate.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import com.dataplate.entity.Fornecedor;

public interface FornecedorRepository extends JpaRepository<Fornecedor, Long> {
    List<Fornecedor> findByAtivoTrue();
    Page<Fornecedor> findByAtivoTrue(Pageable pageable);
    Optional<Fornecedor> findByAtivoTrueAndId(Long id);
}