package com.dataplate.service;

import com.dataplate.dto.AuthLoginRequest;
import com.dataplate.dto.AuthRegisterRequest;
import com.dataplate.dto.AuthResponse;
import com.dataplate.entity.User;
import com.dataplate.repository.UserRepository;
import com.dataplate.security.JwtService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    @Transactional
    public AuthResponse registrar(AuthRegisterRequest req) {
        if (userRepository.existsByEmail(req.email())) {
            throw new IllegalArgumentException("Email já cadastrado: " + req.email());
        }
        User user = User.builder()
                .nome(req.nome())
                .email(req.email())
                .senha(passwordEncoder.encode(req.senha()))
                .role(req.role())
                .build();
        user = userRepository.save(user);
        String token = jwtService.generateToken(user);
        return new AuthResponse(token, user.getId(), user.getNome(), user.getEmail(), user.getRole());
    }

    public AuthResponse login(AuthLoginRequest req) {
        User user = userRepository.findByEmail(req.email())
                .orElseThrow(() -> new BadCredentialsException("Email ou senha inválidos"));
        if (!passwordEncoder.matches(req.senha(), user.getSenha())) {
            throw new BadCredentialsException("Email ou senha inválidos");
        }
        String token = jwtService.generateToken(user);
        return new AuthResponse(token, user.getId(), user.getNome(), user.getEmail(), user.getRole());
    }
}
