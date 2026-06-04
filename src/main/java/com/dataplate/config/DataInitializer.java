package com.dataplate.config;

import com.dataplate.entity.Role;
import com.dataplate.entity.User;
import com.dataplate.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    @Transactional
    public void run(String... args) {
        criarUsuarioPadrao("Gerente Principal", "000.000.000-00", "admin123", Role.ADMIN);
        criarUsuarioPadrao("Atendente", "111.111.111-11", "atendente123", Role.FUNCIONARIO);
        criarUsuarioPadrao("Cozinha", "222.222.222-22", "cozinha123", Role.COZINHA);
    }

    private void criarUsuarioPadrao(String nome, String cpf, String senha, Role role) {
        if (userRepository.existsByCpf(cpf)) {
            return;
        }

        userRepository.save(User.builder()
                .nome(nome)
                .cpf(cpf)
                .senha(passwordEncoder.encode(senha))
                .role(role)
                .build());
    }
}
