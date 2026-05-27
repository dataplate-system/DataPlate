package com.dataplate.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

@Component
public class WebSocketEventListener {
    private static final Logger logger = LoggerFactory.getLogger(WebSocketEventListener.class);

    @EventListener
    public void handleConnect(SessionConnectEvent event) {
        logger.info("WebSocket conectado: {}", event.getMessage().getHeaders().getId());
    }

    @EventListener
    public void handleDisconnect(SessionDisconnectEvent event) {
        logger.info("WebSocket desconectado: {}", event.getSessionId());
    }
}
