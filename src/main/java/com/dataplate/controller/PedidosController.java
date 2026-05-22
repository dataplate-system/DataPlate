package com.dataplate.controller;

import com.dataplate.dto.PedidoCreateRequest;
import com.dataplate.dto.PedidoResponse;
import com.dataplate.dto.PedidoStatusUpdateRequest;
import com.dataplate.service.PedidoService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;

@RestController
@RequestMapping("/api/pedidos")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class PedidosController {
    private static final Logger logger = LoggerFactory.getLogger(PedidosController.class);

    private final PedidoService pedidoService;

    @PostMapping
    public ResponseEntity<PedidoResponse> criar(@Valid @RequestBody PedidoCreateRequest request) {
        PedidoResponse pedido = pedidoService.criar(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(pedido);
    }

    @GetMapping
    public ResponseEntity<List<PedidoResponse>> listar(Authentication authentication, HttpServletRequest request) {
        if (request.getHeader("Authorization") != null && authentication == null) {
            logger.warn("Listagem de pedidos chamada com token invalido ou expirado");
        }
        return ResponseEntity.ok(pedidoService.listar());
    }

    @PutMapping("/{id}/status")
    public ResponseEntity<PedidoResponse> atualizarStatus(
            @PathVariable Long id,
            @Valid @RequestBody PedidoStatusUpdateRequest request) {
        return ResponseEntity.ok(pedidoService.atualizarStatus(id, request.status()));
    }
}
