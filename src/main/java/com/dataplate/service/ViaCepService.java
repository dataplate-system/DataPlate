package com.dataplate.service;

import com.dataplate.dto.Endereco;
import com.dataplate.exception.CepException;
import com.dataplate.util.CepFormatter;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
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
    private static final ObjectMapper objectMapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

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
                    .header("Accept", "application/json")
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
        } catch (CepException ex) {
            throw ex;
        } catch (IllegalArgumentException ex) {
            logger.error("URL invalida para consulta de CEP {}", cepLimpo, ex);
            throw new CepException("Erro interno ao montar consulta de CEP.", ex);
        } catch (JsonProcessingException ex) {
            logger.error("Resposta invalida da ViaCEP para CEP {} - resposta pode nao ser JSON", cepLimpo, ex);
            throw new CepException("CEP nao encontrado ou servico indisponivel. Tente novamente.", ex);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            logger.error("Consulta ViaCEP interrompida para CEP {}", cepLimpo, ex);
            throw new CepException("Consulta de CEP interrompida. Tente novamente.", ex);
        } catch (java.net.http.HttpTimeoutException ex) {
            logger.error("Timeout ao buscar CEP {}", cepLimpo, ex);
            throw new CepException("Tempo esgotado ao buscar CEP. Tente novamente.", ex);
        } catch (java.io.IOException ex) {
            logger.error("Falha de comunicacao com ViaCEP para CEP {}", cepLimpo, ex);
            throw new CepException("Falha de comunicacao com ViaCEP. Tente novamente.", ex);
        } catch (Exception ex) {
            logger.error("Erro ao buscar CEP {}", cepLimpo, ex);
            throw new CepException("Erro ao buscar CEP. Tente novamente.", ex);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
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
