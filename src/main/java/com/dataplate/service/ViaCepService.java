package com.dataplate.service;

import com.dataplate.dto.Endereco;
import com.dataplate.exception.CepException;
import com.dataplate.util.CepFormatter;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

@Service
public class ViaCepService {

    private static final Logger logger = LoggerFactory.getLogger(ViaCepService.class);
    private static final String BASE_URL = "https://viacep.com.br/ws";
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private final HttpClient httpClient;

    public ViaCepService() {
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .version(HttpClient.Version.HTTP_1_1)
                .build();
    }

    public Endereco buscarEndereco(String cep) throws CepException {
        if (!CepFormatter.isValido(cep)) {
            throw new CepException("CEP invalido: " + cep + ". Deve conter 8 digitos.");
        }

        String cepLimpo = CepFormatter.limpar(cep);
        String url = String.format("%s/%s/json/", BASE_URL, cepLimpo);

        try {
            logger.info("Buscando endereco para CEP: {}", cepLimpo);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(10))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 200) {
                throw new CepException("Erro na API ViaCEP. Status: " + response.statusCode());
            }

            ViaCepResponse dto = objectMapper.readValue(response.body(), ViaCepResponse.class);

            if (Boolean.TRUE.equals(dto.erro)) {
                throw new CepException("CEP nao encontrado: " + cepLimpo);
            }

            return new Endereco(
                    dto.cep,
                    dto.logradouro,
                    dto.complemento,
                    dto.bairro,
                    dto.localidade,
                    dto.uf,
                    dto.ibge,
                    dto.gia,
                    dto.ddd,
                    dto.siafi
            );
        } catch (CepException e) {
            throw e;
        } catch (Exception e) {
            logger.error("Erro ao buscar CEP {}", cepLimpo, e);
            throw new CepException("Erro ao buscar CEP: " + e.getMessage(), e);
        }
    }

    private static class ViaCepResponse {
        public String cep;
        public String logradouro;
        public String complemento;
        public String bairro;
        public String localidade;
        public String uf;
        public String ibge;
        public String gia;
        public String ddd;
        public String siafi;
        public Boolean erro;
    }
}
