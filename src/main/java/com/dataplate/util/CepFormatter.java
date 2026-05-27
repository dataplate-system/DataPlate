package com.dataplate.util;

/**
 * Utilitario para formatacao e validacao de CEP.
 */
public class CepFormatter {

    private CepFormatter() {
    }

    /**
     * Remove caracteres especiais do CEP.
     */
    public static String limpar(String cep) {
        if (cep == null) return "";
        return cep.replaceAll("[^0-9]", "");
    }

    /**
     * Formata CEP com hifen (12345-678).
     */
    public static String formatar(String cep) {
        String limpo = limpar(cep);

        if (limpo.length() != 8) {
            throw new IllegalArgumentException(
                    "CEP deve ter 8 digitos. Recebido: " + limpo
            );
        }

        return limpo.substring(0, 5) + "-" + limpo.substring(5);
    }

    /**
     * Valida formato do CEP.
     */
    public static boolean isValido(String cep) {
        String limpo = limpar(cep);
        return limpo.matches("\\d{8}");
    }
}
