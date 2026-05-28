package com.dataplate.controller;

import com.dataplate.dto.UserResponse;
import com.dataplate.entity.Role;
import com.dataplate.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.web.bind.annotation.GetMapping;
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
                    .map(user -> new UserResponse(user.getId(), user.getNome(), user.getCpf(), user.getRole()))
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
}
