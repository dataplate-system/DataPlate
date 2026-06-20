package com.dataplate.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import com.dataplate.entity.Insumo;

public interface InsumoRepository extends JpaRepository<Insumo, Long> {
    List<Insumo> findByAtivoTrue();
    Page<Insumo> findByAtivoTrue(Pageable pageable);
    Optional<Insumo> findByAtivoTrueAndId(Long id);
}
