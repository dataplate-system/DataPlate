package com.dataplate.entity;

import java.math.BigDecimal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "insumos")
public class Insumo {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String nome;

    @Column(nullable = false)
    private String unidade;

    @Column(nullable = false, precision = 12, scale = 3)
    private BigDecimal quantidadeAtual;

    @Column(nullable = false, precision = 12, scale = 3)
    private BigDecimal quantidadeMinima;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal custoUnitario;

    @Builder.Default
    @Column(nullable = false)
    private Boolean ativo = true;

    @PrePersist
    protected void onCreate() {
        if (ativo == null) ativo = true;
    }
}