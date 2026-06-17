package com.dataplate.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.dataplate.entity.Insumo;
public interface InsumoRepository extends JpaRepository<Insumo, Long> {
    List<Insumo> findByAtivoTrue();
    Optional<Insumo> findByAtivoTrueAndId(Long id);

}
