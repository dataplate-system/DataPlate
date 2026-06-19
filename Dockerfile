FROM maven:3.9.6-eclipse-temurin-21-jammy AS build

WORKDIR /workspace

COPY pom.xml ./
COPY src ./src

RUN mvn -B -Dmaven.repo.local=/root/.m2/repository package -DskipTests

FROM eclipse-temurin:21-jre-jammy

WORKDIR /app

COPY --from=build /workspace/target/*.jar /app/app.jar
COPY database /app/database
COPY frontend /app/frontend

EXPOSE 8080

# 👇 adiciona o limite de memória pro free tier
ENTRYPOINT ["java", "-Xmx200m", "-Dspring.profiles.active=prod", "-jar", "/app/app.jar"]