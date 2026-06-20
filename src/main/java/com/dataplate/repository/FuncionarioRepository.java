package com.dataplate.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import com.dataplate.entity.Funcionario;

public interface FuncionarioRepository extends JpaRepository<Funcionario, Long> {
    List<Funcionario> findByAtivoTrue();
    Page<Funcionario> findByAtivoTrue(Pageable pageable);
    Optional<Funcionario> findByAtivoTrueAndId(Long id);
}