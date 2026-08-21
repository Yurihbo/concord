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

## 5. Erro `auth/api-key-not-valid`

Se o site publicado mostrar o cartão vermelho `Firebase: Error (auth/api-key-not-valid-please-pass-a-valid-api-key.)`, o frontend está preservando corretamente o estado de erro e o problema está na variável pública usada pelo workflow. A variável `VITE_FIREBASE_API_KEY` do GitHub Actions precisa ser a chave Web do mesmo projeto Firebase indicado por `VITE_FIREBASE_PROJECT_ID`; não use `BUILT_IN_FORGE_API_KEY`, `JWT_SECRET` ou qualquer credencial administrativa.

O workflow valida a chave antes do build. Uma chave válida deve responder com `MISSING_ID_TOKEN` ao endpoint `accounts:lookup` quando o corpo estiver vazio; uma chave inválida interrompe o deploy com uma mensagem de configuração, sem imprimir o valor da chave. Depois de atualizar as variáveis públicas `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` e `VITE_FIREBASE_MEASUREMENT_ID`, execute novamente o workflow.

## Criação Firebase pendente ou em `Salvando...`

A publicação GitHub Pages entrega apenas o frontend estático; as regras do Firestore precisam estar publicadas no projeto Firebase `condord-112d7`. Se a criação de comunidade ou sala permanecer em `Salvando...`, a aplicação agora encerra a espera após 15 segundos e informa que é necessário verificar conexão, o Firestore Database e as regras. No Firebase Console, abra **Firestore Database → Rules**, publique `firebase/firestore.rules` e confirme que o usuário autenticado pode criar `communities`, `memberships`, `channels` e `voiceRooms`. Nenhuma credencial administrativa deve ser colocada no repositório ou no frontend.
