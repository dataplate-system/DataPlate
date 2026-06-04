package com.dataplate.repository;

import com.dataplate.entity.Restaurante;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface RestauranteRepository extends JpaRepository<Restaurante, Long> {
    Optional<Restaurante> findFirstByAtivoTrue();
}
