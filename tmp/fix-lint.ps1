# === 0) Garantir que estamos na raiz do repo ===
git rev-parse --show-toplevel
# === 1) ESLint: manter ONLY flat config (eslint.config.mjs) na raiz ===
# 1.1) Criar eslint.config.mjs mínimo caso não exista
if (-not (Test-Path -Path "eslint.config.mjs")) {
@'
import tseslint from "typescript-eslint";
export default tseslint.config({
  ignores: ["**/node_modules/**","**/dist/**"],
  files: ["**/*.{ts,tsx,js,cjs,mjs}"],
});
'@ | Set-Content -Encoding UTF8 "eslint.config.mjs"
}
# 1.2) Remover qualquer .eslintrc.* no repo (exceto node_modules/dist/.git)
$eslintRc = Get-ChildItem -Recurse -Force -File |
  Where-Object {
    $_.FullName -notmatch '\\node_modules\\|\\dist\\|\\.git\\' -and
    $_.Name -match '^\.eslintrc(\.|$)'
  }
if ($eslintRc) {
  $eslintRc | ForEach-Object {
    Write-Host "Removendo ESLint legado:" $_.FullName
    Remove-Item -Force $_.FullName
  }
}
# === 2) Prettier: manter ONLY um arquivo (preferir prettier.config.cjs na raiz) ===
# 2.1) Mapear todos os candidatos
$prettierCandidates = @(
  ".prettierrc",".prettierrc.json",".prettierrc.cjs",".prettierrc.js",
  ".prettierrc.yml",".prettierrc.yaml",
  "prettier.config.cjs","prettier.config.js","prettier.config.mjs"
)
# 2.2) Descobrir arquivos existentes (fora de node_modules/dist/.git)
$foundPrettier = Get-ChildItem -Recurse -Force -File |
  Where-Object {
    $_.FullName -notmatch '\\node_modules\\|\\dist\\|\\.git\\' -and
    $prettierCandidates -contains $_.Name
  }
# 2.3) Escolher qual manter (preferência na raiz: prettier.config.cjs > prettier.config.mjs > .prettierrc)
function Prefer-Prettier {
  param([array]$files)
  $root = (git rev-parse --show-toplevel)
  $byRoot = $files | Sort-Object { $_.FullName.StartsWith($root) -notmatch $true } # raiz primeiro
  $preferOrder = @("prettier.config.cjs","prettier.config.mjs",".prettierrc",".prettierrc.json",".prettierrc.yaml",".prettierrc.yml",".prettierrc.cjs",".prettierrc.js","prettier.config.js")
  foreach ($name in $preferOrder) {
    $hit = $byRoot | Where-Object { $_.Name -eq $name } | Select-Object -First 1
    if ($hit) { return $hit }
  }
  return $byRoot | Select-Object -First 1
}
$keepPrettier = $null
if ($foundPrettier) { $keepPrettier = Prefer-Prettier -files $foundPrettier }
# 2.4) Remover os demais
if ($foundPrettier) {
  foreach ($f in $foundPrettier) {
    if ($keepPrettier -and ($f.FullName -eq $keepPrettier.FullName)) { continue }
    Write-Host "Removendo Prettier duplicado:" $f.FullName
    Remove-Item -Force $f.FullName
  }
}
# 2.5) Criar um prettier.config.cjs mínimo se nenhum existir
if (-not $keepPrettier) {
  @'
// Prettier config mínima do monorepo
/** @type {import("prettier").Config} */
module.exports = {
  printWidth: 100,
  singleQuote: true,
  trailingComma: "all",
  semi: true,
};
'@ | Set-Content -Encoding UTF8 "prettier.config.cjs"
}
# === 3) package.json (raiz): usar typescript-eslint (meta) e remover parser/plugin legados ===
$pkgPath = "package.json"
if (Test-Path $pkgPath) {
  $json = Get-Content $pkgPath -Raw | ConvertFrom-Json
  if (-not $json.devDependencies) {
    # Cria devDependencies se não existir
    $json | Add-Member -NotePropertyName devDependencies -NotePropertyValue (@{}) -Force
  }
  # Recriar o objeto devDependencies sem os pacotes legados
  $dev = @{}
  foreach ($p in $json.devDependencies.PSObject.Properties) {
    if ($p.Name -ne "@typescript-eslint/parser" -and $p.Name -ne "@typescript-eslint/eslint-plugin") {
      $dev[$p.Name] = $p.Value
    }
  }
  # Garante o meta-pacote (ajuste a versão se quiser travar)
  $dev["typescript-eslint"] = $dev["typescript-eslint"] | ForEach-Object { $_ } # preserva se já tiver
  if (-not $dev["typescript-eslint"]) { $dev["typescript-eslint"] = "^8.43.0" }
  $json.devDependencies = $dev
  # Escreve de volta
  $json | ConvertTo-Json -Depth 100 | Set-Content -Encoding UTF8 $pkgPath
}
# === 4) Commit (somente se houve alterações) ===
git add -A
# Se nada mudou, o commit vai falhar; suprimir erro com try/catch
try {
  git commit -m "chore(lint): usar ESLint flat (typescript-eslint) e um único Prettier; remover configs legadas"
} catch { }
# === 5) Reinstalar deps para refletir package.json atualizado ===
# Use APENAS um gerenciador. Abaixo, npm por padrão; com pnpm, comente npm e descomente pnpm.
npm install
# pnpm install
