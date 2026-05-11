package com.dataplate.controller;

import com.dataplate.dto.PedidoCreateRequest;
import com.dataplate.dto.PedidoResponse;
import com.dataplate.service.PedidoService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/pedidos")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class PedidosController {
    private final PedidoService pedidoService;

    @PostMapping
    public ResponseEntity<PedidoResponse> criar(@Valid @RequestBody PedidoCreateRequest request) {
        PedidoResponse pedido = pedidoService.criar(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(pedido);
    }

    @GetMapping
    public ResponseEntity<List<PedidoResponse>> listar() {
        return ResponseEntity.ok(pedidoService.listar());
    }
}
