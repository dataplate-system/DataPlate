package com.dataplate.util;

/**
 * Utilitário para formatação e validação de CEP
 */
public class CepFormatter {
    
    private static final String CEP_PATTERN = "\\d{5}-?\\d{3}";
    
    /**
     * Remove caracteres especiais do CEP
     */
    public static String limpar(String cep) {
        if (cep == null) return "";
        return cep.replaceAll("[^0-9]", "");
    }
    
    /**
     * Formata CEP com hífen (12345-678)
     */
    public static String formatar(String cep) {
        String limpo = limpar(cep);
        
        if (limpo.length() != 8) {
            throw new IllegalArgumentException(
                "CEP deve ter 8 dígitos. Recebido: " + limpo
            );
        }
        
        return limpo.substring(0, 5) + "-" + limpo.substring(5);
    }
    
    /**
     * Valida formato do CEP
     */
    public static boolean isValido(String cep) {
        String limpo = limpar(cep);
        return limpo.matches("\\d{8}");
    }
}