package com.dataplate.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import java.time.LocalDateTime;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "produto")
public class Produto {
    
    @Id
    @Column(name = "id_produto")
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "id_categoria", nullable = false)
    private Long idCategoria;

    @Column(name = "nome", nullable = false, length = 200)
    private String nome;

    @Column(name = "descricao", length = 1000)
    private String descricao;

    @Column(name = "preco", nullable = false)
    private Double preco;

    @Column(name = "imagem")
    private String imagem;

    @Column(name = "ativo", nullable = false)
    private Boolean ativo = true;

    @Column(name = "tempo_preparo")
    private Integer tempoPreparo;

    @Column(name = "destaque", nullable = false)
    private Boolean destaque = false;

    @Column(name = "criado_em", nullable = false, updatable = false)
    private LocalDateTime criadoEm;

    // Hook para setar data de criação automaticamente
    @jakarta.persistence.PrePersist
    protected void onCreate() {
        if (criadoEm == null) {
            criadoEm = LocalDateTime.now();
        }
        if (ativo == null) {
            ativo = true;
        }
        if (destaque == null) {
            destaque = false;
        }
    }
}