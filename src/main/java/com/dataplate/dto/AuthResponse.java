package com.dataplate.dto;

import com.dataplate.entity.Role;

public record AuthResponse(
        String token,
        String refreshToken,
        Long id,
        String nome,
        String email,
        Role role
) {
}
