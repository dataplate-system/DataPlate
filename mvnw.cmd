@REM ----------------------------------------------------------------------------
@REM Maven Start Up Batch script
@REM ----------------------------------------------------------------------------
@echo off
setlocal

set MAVEN_WRAPPER_JAR="%MAVEN_USER_HOME%\.m2\wrapper\dists\apache-maven-3.9.9\maven-wrapper.jar"
set MAVEN_WRAPPER_PROPERTIES="%~dp0.mvn\wrapper\maven-wrapper.properties"
set MAVEN_WRAPPER_DOWNLOADER_ARGS=-Dmaven.wrapper.propertiesFile="%MAVEN_WRAPPER_PROPERTIES%"

for /f "tokens=1,2 delims==" %%a in ('type "%~dp0.mvn\wrapper\maven-wrapper.properties"') do (
    if "%%a"=="distributionUrl" set DISTRIBUTION_URL=%%b
    if "%%a"=="wrapperUrl" set WRAPPER_URL=%%b
)

set MAVEN_USER_HOME=%USERPROFILE%
set MAVEN_WRAPPER_DIR=%MAVEN_USER_HOME%\.m2\wrapper\dists\apache-maven-3.9.9-bin
set MAVEN_HOME=%MAVEN_WRAPPER_DIR%\apache-maven-3.9.9

if not exist "%MAVEN_HOME%\bin\mvn.cmd" (
    echo Baixando Apache Maven 3.9.9...
    powershell -NoProfile -Command ^
        "$url = 'https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.9/apache-maven-3.9.9-bin.zip';" ^
        "$dest = '%MAVEN_WRAPPER_DIR%\maven.zip';" ^
        "New-Item -ItemType Directory -Force '%MAVEN_WRAPPER_DIR%' | Out-Null;" ^
        "Invoke-WebRequest -Uri $url -OutFile $dest;" ^
        "Expand-Archive -Path $dest -DestinationPath '%MAVEN_WRAPPER_DIR%' -Force;" ^
        "Remove-Item $dest"
    echo Maven baixado com sucesso.
)

set PATH=%MAVEN_HOME%\bin;%PATH%
mvn %*
endlocal
