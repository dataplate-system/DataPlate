package com.dataplate.dto;

import com.dataplate.entity.Role;

public record UserResponse(
        Long id,
        String nome,
        String email,
        Role role
) {
}
