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
@Table(name = "restaurante")
public class Restaurante {

    @Id
    @Column(name = "id_restaurante")
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "nome", nullable = false, length = 150)
    private String nome;

    @Column(name = "cnpj", nullable = false, length = 18)
    private String cnpj;

    @Column(name = "telefone", length = 20)
    private String telefone;

    @Column(name = "endereco", columnDefinition = "TEXT")
    private String endereco;

    @Column(name = "email", nullable = false, length = 255)
    private String email;

    @Column(name = "ativo", nullable = false)
    private Boolean ativo = true;
}
