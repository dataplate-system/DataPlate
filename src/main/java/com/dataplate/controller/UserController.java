package com.dataplate.controller;

import com.dataplate.dto.UserResponse;
import com.dataplate.dto.UserUpdateRequest;
import com.dataplate.entity.Role;
import com.dataplate.entity.User;
import com.dataplate.repository.UserRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/usuarios")
@RequiredArgsConstructor
public class UserController {
    private static final Logger logger = LoggerFactory.getLogger(UserController.class);

    private final UserRepository repository;

    @GetMapping
    public List<UserResponse> listar() {
        try {
            return repository.findAll().stream()
                    .map(u -> new UserResponse(u.getId(), u.getNome(), u.getCpf(), u.getRole()))
                    .toList();
        } catch (DataAccessException ex) {
            logger.warn("Nao foi possivel carregar usuarios do banco. Usando usuarios demo.", ex);
            return List.of(
                    new UserResponse(1L, "Gerente Principal", "000.000.000-00", Role.ADMIN),
                    new UserResponse(2L, "Atendente", "111.111.111-11", Role.FUNCIONARIO),
                    new UserResponse(3L, "Cozinha", "222.222.222-22", Role.COZINHA)
            );
        }
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<UserResponse> atualizar(@PathVariable Long id, @Valid @RequestBody UserUpdateRequest request) {
        return repository.findById(id)
                .map(user -> {
                    user.setNome(request.nome());
                    user.setCpf(request.cpf());
                    user.setRole(request.role());
                    User saved = repository.save(user);
                    return ResponseEntity.ok(new UserResponse(saved.getId(), saved.getNome(), saved.getCpf(), saved.getRole()));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> excluir(@PathVariable Long id) {
        if (!repository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        repository.deleteById(id);
        return ResponseEntity.noContent().build();
    }
}
