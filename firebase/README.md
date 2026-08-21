# Configuração Firebase do Concord

O projeto Firebase usado pelo Concord é `condord-112d7`. O frontend usa somente a configuração pública do Web App. Não publique credenciais de service account, `private_key` ou tokens administrativos.

## Authentication

Em **Authentication → Sign-in method**, habilite **Google** e **Email/Password**. Em **Authentication → Settings → Authorized domains**, adicione o domínio do site publicado no GitHub Pages. Para este repositório de projeto, o host esperado é `yurihbo.github.io`; o caminho `/concord/` não é incluído no campo de domínio.

## Firestore

Crie o banco Firestore em modo de produção. Publique `firestore.rules` e `firestore.indexes.json` pelo Firebase CLI ou copie as regras pelo console. As regras devem permanecer restritivas; a chave Web não concede acesso administrativo.

## GitHub Actions

No repositório `Yurihbo/concord`, crie estas **Repository variables** em Settings → Secrets and variables → Actions → Variables:

| Nome | Valor |
|---|---|
| `VITE_FIREBASE_API_KEY` | `apiKey` do Web App |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` do Web App |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` do Web App |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` do Web App |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` do Web App |
| `VITE_FIREBASE_APP_ID` | `appId` do Web App |
| `VITE_FIREBASE_MEASUREMENT_ID` | `measurementId`, se usado |

O workflow `.github/workflows/deploy-pages.yml` compila o frontend com `GITHUB_PAGES=true`, usa o base path `/concord/` e envia `dist/public` para o GitHub Pages. A migração completa da camada tRPC para Firestore ainda precisa ser concluída antes de considerar o site funcional em produção.
