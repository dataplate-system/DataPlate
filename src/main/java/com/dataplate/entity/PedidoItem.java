package com.dataplate.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
<<<<<<< HEAD
@Table(name = "pedido_itens")
public class PedidoItem {
    @Id
=======
@Table(name = "item_pedido")
public class PedidoItem {
    @Id
    @Column(name = "id_item_pedido")
>>>>>>> 37a57ca (Armazenar os dados do front e back no banco de dados)
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
<<<<<<< HEAD
    @JoinColumn(name = "pedido_id", nullable = false)
    private Pedido pedido;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "produto_id", nullable = false)
    private Produto produto;

    @Column(nullable = false)
    private Integer quantidade;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal precoUnitario;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal subtotal;
=======
    @JoinColumn(name = "id_pedido", nullable = false)
    private Pedido pedido;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_produto", nullable = false)
    private Produto produto;

    @Column(name = "quantidade", nullable = false, precision = 8, scale = 3)
    private BigDecimal quantidade;

    @Column(name = "preco_unitario", nullable = false, precision = 10, scale = 2)
    private BigDecimal precoUnitario;

    @Column(name = "subtotal", insertable = false, updatable = false, precision = 10, scale = 2)
    private BigDecimal subtotal;

    @Column(name = "observacao")
    private String observacao;

    @Column(name = "cancelado", nullable = false)
    private Boolean cancelado = false;

    @jakarta.persistence.PrePersist
    protected void onCreate() {
        if (cancelado == null) {
            cancelado = false;
        }
    }
>>>>>>> 37a57ca (Armazenar os dados do front e back no banco de dados)
}
