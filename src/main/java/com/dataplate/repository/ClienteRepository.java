package com.dataplate.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import com.dataplate.entity.Cliente;

public interface ClienteRepository extends JpaRepository<Cliente, Long> {
    List<Cliente> findByAtivoTrue();
    Page<Cliente> findByAtivoTrue(Pageable pageable);
    Optional<Cliente> findByAtivoTrueAndId(Long id);
}