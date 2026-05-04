package com.dataplate.dto;

import com.dataplate.entity.Role;

public record AuthResponse(
        String token,
        Long id,
        String nome,
        String email,
        Role role
) {
}
