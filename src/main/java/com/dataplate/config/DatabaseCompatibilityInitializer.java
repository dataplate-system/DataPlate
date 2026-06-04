package com.dataplate.config;

import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Order(0)
public class DatabaseCompatibilityInitializer implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(DatabaseCompatibilityInitializer.class);

    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(String... args) {
        jdbcTemplate.execute("ALTER TABLE pedido ALTER COLUMN id_mesa DROP NOT NULL");
        log.info("Compatibilidade do banco validada: pedido.id_mesa aceita vendas sem mesa.");
    }
}
