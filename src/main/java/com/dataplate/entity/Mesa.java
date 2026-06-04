package com.dataplate.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "mesa")
public class Mesa {
    @Id
    @Column(name = "id_mesa")
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "id_restaurante", nullable = false)
    private Long idRestaurante;

    @Column(nullable = false)
    private Integer numero;

    @Column(nullable = false)
    private Integer capacidade;

    @Column(nullable = false, length = 20)
    private String status;

    @Column(length = 100)
    private String localizacao;

    @Column(nullable = false)
    private Boolean ativo = true;
}
