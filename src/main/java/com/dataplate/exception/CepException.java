package com.dataplate.exception;

/**
 * Exceção customizada para erros de CEP
 */
public class CepException extends Exception {
    
    public CepException(String mensagem) {
        super(mensagem);
    }
    
    public CepException(String mensagem, Throwable cause) {
        super(mensagem, cause);
    }
}