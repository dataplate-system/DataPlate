package com.dataplate.exception;

public class ErrorResponse {
    private String mensagem;
    private long timestamp;
    
    public ErrorResponse(String mensagem) {
        this.mensagem = mensagem;
        this.timestamp = System.currentTimeMillis();
    }
    
    public String getMensagem() {
        return mensagem;
    }
    
    public void setMensagem(String mensagem) {
        this.mensagem = mensagem;
    }
    
    public long getTimestamp() {
        return timestamp;
    }
    
    public void setTimestamp(long timestamp) {
        this.timestamp = timestamp;
    }
}