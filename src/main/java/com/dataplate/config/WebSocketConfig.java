package com.dataplate.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

import java.util.List;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Value("${dataplate.allowed-origins:https://dataplate.onrender.com,http://localhost:5500,http://localhost:8080,http://localhost:5173}")
    private String allowedOrigins;

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic", "/queue");
        registry.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        String[] origins = List.of(allowedOrigins.split("\\s*,\\s*")).toArray(String[]::new);
        registry.addEndpoint("/ws").setAllowedOrigins(origins);
        registry.addEndpoint("/ws").setAllowedOrigins(origins).withSockJS();
    }
}
