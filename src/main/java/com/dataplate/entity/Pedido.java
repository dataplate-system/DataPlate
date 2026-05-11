package com.dataplate.entity;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
<<<<<<< HEAD
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
=======
>>>>>>> 37a57ca (Armazenar os dados do front e back no banco de dados)
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
<<<<<<< HEAD
@Table(name = "pedidos")
public class Pedido {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Integer numeroMesa;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PedidoStatus status;

    @Column(nullable = false)
    private LocalDateTime dataHora;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal valorTotal;

    @Builder.Default
    @OneToMany(mappedBy = "pedido", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<PedidoItem> itens = new ArrayList<>();
=======
@Table(name = "pedido")
public class Pedido {
    @Id
    @Column(name = "id_pedido")
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "id_mesa", nullable = false)
    private Integer idMesa;

    @Column(name = "id_status", nullable = false)
    private Integer idStatus;

    @Column(name = "numero_pedido", nullable = false, length = 20)
    private String numeroPedido;

    @Column(name = "data_hora", nullable = false)
    private LocalDateTime dataHora;

    @Column(name = "observacoes")
    private String observacoes;

    @Column(name = "valor_total", nullable = false, precision = 10, scale = 2)
    private BigDecimal valorTotal;

    @Column(name = "atualizado_em", nullable = false)
    private LocalDateTime atualizadoEm;

    @Builder.Default
    @OneToMany(mappedBy = "pedido", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<PedidoItem> itens = new ArrayList<>();

    @jakarta.persistence.PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        if (dataHora == null) {
            dataHora = now;
        }
        if (atualizadoEm == null) {
            atualizadoEm = now;
        }
        if (valorTotal == null) {
            valorTotal = BigDecimal.ZERO;
        }
    }

    @jakarta.persistence.PreUpdate
    protected void onUpdate() {
        atualizadoEm = LocalDateTime.now();
    }
>>>>>>> 37a57ca (Armazenar os dados do front e back no banco de dados)
}
