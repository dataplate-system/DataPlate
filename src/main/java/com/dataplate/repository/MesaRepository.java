package com.dataplate.repository;

import com.dataplate.entity.Mesa;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MesaRepository extends JpaRepository<Mesa, Long> {
    List<Mesa> findByAtivoTrueOrderByNumeroAsc();

    Optional<Mesa> findByNumeroAndAtivoTrue(Integer numero);
}
