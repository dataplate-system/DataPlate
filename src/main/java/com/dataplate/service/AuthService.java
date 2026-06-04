package com.dataplate.service;

import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.dataplate.dto.AuthLoginRequest;
import com.dataplate.dto.AuthPasswordResetRequest;
import com.dataplate.dto.AuthRefreshRequest;
import com.dataplate.dto.AuthRegisterRequest;
import com.dataplate.dto.AuthResponse;
import com.dataplate.entity.User;
import com.dataplate.repository.UserRepository;
import com.dataplate.security.JwtService;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class AuthService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    @Transactional
    public AuthResponse registrar(AuthRegisterRequest req) {
        String nome = req.nome() == null ? "" : req.nome().trim();
        String cpf = req.cpf() == null ? "" : req.cpf().trim();

        if (nome.isBlank()) {
            throw new IllegalArgumentException("Nome obrigatorio");
        }
        if (cpf.isBlank()) {
            throw new IllegalArgumentException("CPF obrigatorio");
        }
        if (userRepository.existsByCpf(cpf)) {
            throw new IllegalArgumentException("CPF ja cadastrado: " + cpf);
        }

        User user = User.builder()
                .nome(nome)
                .cpf(cpf)
                .senha(passwordEncoder.encode(req.senha()))
                .role(req.role())
                .build();
        user = userRepository.save(user);
        return toAuthResponse(user);
    }

    public AuthResponse login(AuthLoginRequest req) {
        User user = userRepository.findByCpf(req.cpf())
                .orElseThrow(() -> new BadCredentialsException("CPF ou senha invalidos"));
        if (!passwordEncoder.matches(req.senha(), user.getSenha())) {
            throw new BadCredentialsException("CPF ou senha invalidos");
        }
        return toAuthResponse(user);
    }

    public AuthResponse refresh(AuthRefreshRequest req) {
        String cpf;
        try {
            cpf = jwtService.extractRefreshUsername(req.refreshToken());
        } catch (RuntimeException ex) {
            throw new BadCredentialsException("Refresh token invalido");
        }

        User user = userRepository.findByCpf(cpf)
                .orElseThrow(() -> new BadCredentialsException("Refresh token invalido"));

        if (!jwtService.isRefreshTokenValid(req.refreshToken(), user)) {
            throw new BadCredentialsException("Refresh token invalido");
        }

        return toAuthResponse(user);
    }

    @Transactional
    public void redefinirSenha(AuthPasswordResetRequest req) {
        User user = userRepository.findByCpf(req.cpf())
                .orElseThrow(() -> new BadCredentialsException("CPF nao encontrado"));
        user.setSenha(passwordEncoder.encode(req.novaSenha()));
        userRepository.save(user);
    }

    private AuthResponse toAuthResponse(User user) {
        String token = jwtService.generateToken(user);
        String refreshToken = jwtService.generateRefreshToken(user);
        return new AuthResponse(token, refreshToken, user.getId(), user.getNome(), user.getCpf(), user.getRole());
    }
}
