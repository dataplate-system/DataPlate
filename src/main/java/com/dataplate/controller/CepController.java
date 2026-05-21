package com.dataplate.controller;

import com.dataplate.dto.Endereco;
import com.dataplate.exception.CepException;
import com.dataplate.service.ViaCepService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/cep")
@CrossOrigin(origins = "*", allowedHeaders = "*")
@RequiredArgsConstructor
public class CepController {

    private final ViaCepService viaCepService;

    @GetMapping({"/buscar/{cep}", "/{cep}"})
    public ResponseEntity<Map<String, Object>> buscarCep(@PathVariable String cep) {
        try {
            Endereco endereco = viaCepService.buscarEndereco(cep);

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("sucesso", true);
            response.put("cep", endereco.cep());
            response.put("logradouro", endereco.logradouro());
            response.put("complemento", endereco.complemento());
            response.put("bairro", endereco.bairro());
            response.put("localidade", endereco.localidade());
            response.put("uf", endereco.uf());
            response.put("ibge", endereco.ibge());
            response.put("gia", endereco.gia());
            response.put("ddd", endereco.ddd());
            response.put("siafi", endereco.siafi());

            return ResponseEntity.ok(response);
        } catch (CepException e) {
            return ResponseEntity
                    .status(HttpStatus.BAD_REQUEST)
                    .body(errorResponse(e.getMessage()));
        }
    }

    private Map<String, Object> errorResponse(String mensagem) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("sucesso", false);
        response.put("mensagem", mensagem);
        return response;
    }
}
