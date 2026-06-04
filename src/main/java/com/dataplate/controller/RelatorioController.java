package com.dataplate.controller;

import com.dataplate.dto.RelatorioCardapioResponse;
import com.dataplate.dto.RelatorioOperacionalResponse;
import com.dataplate.dto.RelatorioResumoResponse;
import com.dataplate.dto.RelatorioVendasResponse;
import com.dataplate.service.RelatorioService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/relatorios")
@RequiredArgsConstructor
public class RelatorioController {
    private final RelatorioService service;

    @GetMapping("/resumo")
    public RelatorioResumoResponse resumo(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate inicio,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fim) {
        return service.resumo(inicio, fim);
    }

    @GetMapping("/vendas")
    public RelatorioVendasResponse vendas(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate inicio,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fim) {
        return service.vendas(inicio, fim);
    }

    @GetMapping("/cardapio")
    public RelatorioCardapioResponse cardapio(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate inicio,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fim) {
        return service.cardapio(inicio, fim);
    }

    @GetMapping("/operacional")
    public RelatorioOperacionalResponse operacional(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate inicio,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fim) {
        return service.operacional(inicio, fim);
    }
}
