package com.dataplate.controller;

import com.dataplate.dto.UserResponse;
import com.dataplate.dto.UserUpdateRequest;
import com.dataplate.entity.User;
import com.dataplate.repository.UserRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
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

    private final UserRepository repository;

    @GetMapping
    public List<UserResponse> listar() {
        return repository.findAll(PageRequest.of(0, 500)).getContent().stream()
                .map(u -> new UserResponse(u.getId(), u.getNome(), u.getCpf(), u.getRole()))
                .toList();
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
