package com.dataplate.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class StaticResourceConfig implements WebMvcConfigurer {

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/frontend/**")
                .addResourceLocations("file:frontend/");

        registry.addResourceHandler("/pages/**")
                .addResourceLocations("file:frontend/pages/");

        registry.addResourceHandler("/Css/**")
                .addResourceLocations("file:frontend/Css/");

        registry.addResourceHandler("/JavaScript/**")
                .addResourceLocations("file:frontend/JavaScript/");

        registry.addResourceHandler("/images/**")
                .addResourceLocations("file:frontend/images/");
    }

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        registry.addRedirectViewController("/", "/frontend/pages/index.html");
        registry.addRedirectViewController("/adm", "/frontend/pages/adm.html");
        registry.addRedirectViewController("/admin", "/frontend/pages/adm.html");
    }
}
