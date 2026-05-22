package com.dataplate.controller;

import com.dataplate.dto.AuthLoginRequest;
import com.dataplate.dto.AuthRefreshRequest;
import com.dataplate.dto.AuthRegisterRequest;
import com.dataplate.dto.AuthResponse;
import com.dataplate.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {
    private final AuthService service;

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody AuthLoginRequest request) {
        return service.login(request);
    }

    @PostMapping("/refresh")
    public AuthResponse refresh(@Valid @RequestBody AuthRefreshRequest request) {
        return service.refresh(request);
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse register(@Valid @RequestBody AuthRegisterRequest request) {
        return service.registrar(request);
    }
}
