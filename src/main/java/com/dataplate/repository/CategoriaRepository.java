package com.dataplate.repository;

import com.dataplate.entity.Categoria;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CategoriaRepository extends JpaRepository<Categoria, Long> {

    List<Categoria> findByAtivoTrueOrderByOrdemAscNomeAsc();

    Optional<Categoria> findByNomeIgnoreCaseAndAtivoTrue(String nome);
}
