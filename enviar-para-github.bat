@echo off
setlocal
cd /d "%~dp0"

set "REPOSITORY_URL=https://github.com/inesprazeres0-ctrl/Infovida.git"
set "BRANCH=main"

where git >nul 2>&1
if errorlevel 1 (
  echo ERRO: Git nao foi encontrado. Instale o Git for Windows e tente novamente.
  goto :failed
)

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo ERRO: Esta pasta nao e um repositorio Git.
  goto :failed
)

for /f "delims=" %%R in ('git remote get-url origin 2^>nul') do set "CURRENT_REMOTE=%%R"
if not defined CURRENT_REMOTE (
  echo Configurando o repositorio remoto do GitHub...
  git remote add origin "%REPOSITORY_URL%"
  if errorlevel 1 goto :failed
) else (
  if /I not "%CURRENT_REMOTE%"=="%REPOSITORY_URL%" (
    echo ERRO: O remote origin ja aponta para outro repositorio:
    echo %CURRENT_REMOTE%
    echo Nenhuma alteracao foi feita no remote.
    goto :failed
  )
)

echo.
echo Arquivos que serao publicados:
git status --short

echo.
echo Arquivos ignorados, como .env, data e node_modules, nao serao enviados.
choice /C SN /N /M "Continuar e criar o commit/publicar no GitHub? [S/N] "
if errorlevel 2 goto :cancelled

git add -A
if errorlevel 1 goto :failed

git diff --cached --quiet
if errorlevel 2 goto :failed
if errorlevel 1 (
  git commit -m "Publica projeto Infovida"
  if errorlevel 1 goto :failed
)

echo.
echo Enviando a branch %BRANCH% para o GitHub...
git push -u origin %BRANCH%
if errorlevel 1 (
  echo.
  echo O push falhou. Confira o login do GitHub e se o repositorio remoto esta vazio.
  echo Se o repositorio remoto ja tiver commits, integre-os antes de tentar novamente.
  goto :failed
)

echo.
echo Projeto publicado com sucesso em %REPOSITORY_URL%
echo.
pause
exit /b 0

:cancelled
echo Operacao cancelada. Nenhum arquivo foi publicado.
pause
exit /b 0

:failed
echo.
echo Processo interrompido. Leia a mensagem acima e corrija o problema antes de tentar novamente.
pause
exit /b 1
