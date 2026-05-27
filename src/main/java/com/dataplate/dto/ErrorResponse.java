package com.dataplate.dto;

import java.time.LocalDateTime;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ErrorResponse {
    
    private String mensagem;
    private String erro;
    private Integer status;
    private LocalDateTime timestamp;
    private String path;
    
    // Construtor simples
    public ErrorResponse(String mensagem) {
        this.mensagem = mensagem;
        this.timestamp = LocalDateTime.now();
    }
    
    // Com status
    public ErrorResponse(String mensagem, Integer status) {
        this.mensagem = mensagem;
        this.status = status;
        this.timestamp = LocalDateTime.now();
    }
    
    // Com tipo de erro
    public ErrorResponse(String mensagem, String erro) {
        this.mensagem = mensagem;
        this.erro = erro;
        this.timestamp = LocalDateTime.now();
    }
}