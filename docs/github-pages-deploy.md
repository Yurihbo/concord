# Publicação do Concord no GitHub Pages

O Concord possui dois modos. O desenvolvimento local e o hosting Manus continuam usando o fluxo existente; o workflow de GitHub Pages usa `VITE_FIREBASE_MODE=true` e inicializa o workspace Firebase estático.

## 1. Configuração do Firebase

No Firebase Console, habilite Google e Email/Password em **Authentication → Sign-in method**. Em **Authentication → Settings → Authorized domains**, adicione o domínio do Pages, normalmente `yurihbo.github.io`.

Publique as regras e índices a partir da raiz do repositório:

```bash
firebase login
firebase use condord-112d7
firebase deploy --only firestore:rules,firestore:indexes
```

A configuração pública do Web SDK não é um segredo administrativo. A chave `service_role`, chaves privadas e arquivos de service account nunca devem ser adicionados ao frontend ou ao repositório.

## 2. Variáveis do workflow

No repositório GitHub, abra **Settings → Secrets and variables → Actions → Variables** e crie as seguintes variáveis públicas, usando os valores do Web App Firebase:

| Variável | Origem |
|---|---|
| `VITE_FIREBASE_API_KEY` | `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | `appId` |
| `VITE_FIREBASE_MEASUREMENT_ID` | `measurementId`, opcional |

## 3. GitHub Pages

Em **Settings → Pages**, selecione **GitHub Actions** como fonte — não `Deploy from a branch`. O arquivo `.github/workflows/deploy-pages.yml` compila `build:pages`, copia `index.html` para `404.html` para preservar o roteamento SPA e publica `dist/public`. Se a API de Pages mostrar `build_type: legacy` e `source.branch: main`, a fonte ainda está configurada como branch; nesse estado, o workflow pode terminar verde, mas o domínio continuará exibindo 404 até a fonte ser alterada para **GitHub Actions**.

O Vite usa `/concord/` como base para o repositório `Yurihbo/concord`. Se o nome do repositório mudar, atualize a condição de base em `vite.config.ts`.

## 4. Validação

Depois do primeiro workflow verde, valide nesta ordem: login Google; criação de conta por email; perfil e ID `CON-XXXXXXXX`; comunidade/canal; mensagem de canal; busca e aceite de amizade; DM; criação de até três salas; entrada/saída; mute/desmute e indicador verde; tons de entrada/saída/mute/desmute; áudio remoto WebRTC; compartilhamento de tela; atualização ao recarregar.

O build local equivalente é:

```bash
VITE_FIREBASE_MODE=true GITHUB_PAGES=true pnpm build:pages
cp dist/public/index.html dist/public/404.html
pnpm check
pnpm test
```

A publicação não deve ser feita por comandos locais nesta migração; o push para `main` aciona o workflow do GitHub Actions.
