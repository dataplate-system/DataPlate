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
@Table(name = "pedido_status_historico")
public class PedidoStatusHistorico {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "id_pedido", nullable = false)
    private Long idPedido;

    @Column(name = "status", nullable = false, length = 30)
    private String status;

    @Column(name = "registrado_em", nullable = false)
    private LocalDateTime registradoEm;

    @jakarta.persistence.PrePersist
    protected void onCreate() {
        if (registradoEm == null) registradoEm = LocalDateTime.now();
    }
}
