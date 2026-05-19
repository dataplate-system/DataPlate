package com.dataplate.controller;

import com.dataplate.dto.UserResponse;
import com.dataplate.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
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
        return repository.findAll().stream()
                .map(user -> new UserResponse(user.getId(), user.getNome(), user.getEmail(), user.getRole()))
                .toList();
    }
}
