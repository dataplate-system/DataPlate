package com.dataplate.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Date;
import java.util.function.Function;

import javax.crypto.SecretKey;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;

@Service
public class JwtService {
    @Value("${dataplate.jwt.secret}")
    private String secret;

    @Value("${dataplate.jwt.expiration-ms}")
    private long expirationMs;

    @Value("${dataplate.jwt.refresh-secret:${dataplate.jwt.secret}}")
    private String refreshSecret;

    @Value("${dataplate.jwt.refresh-expiration-ms:604800000}")
    private long refreshExpirationMs;

    public String generateToken(UserDetails userDetails) {
        return generateToken(userDetails, expirationMs, secret);
    }

    public String generateRefreshToken(UserDetails userDetails) {
        return generateToken(userDetails, refreshExpirationMs, refreshSecret);
    }

    private String generateToken(UserDetails userDetails, long ttlMs, String signingSecret) {
        Date now = new Date();
        return Jwts.builder()
                .setSubject(userDetails.getUsername())
                .setIssuedAt(now)
                .setExpiration(new Date(now.getTime() + ttlMs))
                .signWith(getSigningKey(signingSecret))
                .compact();
    }

    public String extractUsername(String token) {
        return extractClaim(token, Claims::getSubject);
    }

    public boolean isTokenValid(String token, UserDetails userDetails) {
        return isTokenValid(token, userDetails, false);
    }

    public boolean isRefreshTokenValid(String token, UserDetails userDetails) {
        return isTokenValid(token, userDetails, true);
    }

    public String extractRefreshUsername(String token) {
        return extractClaim(token, Claims::getSubject, true);
    }

    private boolean isTokenValid(String token, UserDetails userDetails, boolean refresh) {
        try {
            String username = refresh ? extractRefreshUsername(token) : extractUsername(token);
            return username.equals(userDetails.getUsername()) && !isExpired(token, refresh);
        } catch (JwtException | IllegalArgumentException ex) {
            return false;
        }
    }

    private boolean isExpired(String token) {
        return isExpired(token, false);
    }

    private boolean isExpired(String token, boolean refresh) {
        return extractClaim(token, Claims::getExpiration, refresh).before(new Date());
    }

    private <T> T extractClaim(String token, Function<Claims, T> resolver) {
        return extractClaim(token, resolver, false);
    }

    private <T> T extractClaim(String token, Function<Claims, T> resolver, boolean refresh) {
        Claims claims = Jwts.parserBuilder()
                .setSigningKey(getSigningKey(refresh ? refreshSecret : secret))
                .build()
                .parseClaimsJws(token)
                .getBody();
        return resolver.apply(claims);
    }

    private SecretKey getSigningKey() {
        return getSigningKey(secret);
    }

    private SecretKey getSigningKey(String value) {
        byte[] keyBytes;
        try {
            keyBytes = Decoders.BASE64.decode(value);
        } catch (IllegalArgumentException ex) {
            keyBytes = value.getBytes(StandardCharsets.UTF_8);
        }

        if (keyBytes.length < 32) {
            keyBytes = sha256(value);
        }

        return Keys.hmacShaKeyFor(keyBytes);
    }

    private byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 indisponivel", ex);
        }
    }
}
