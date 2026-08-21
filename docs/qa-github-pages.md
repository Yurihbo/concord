# QA do GitHub Pages

Em 21 de agosto de 2026, o workflow `Deploy Concord to GitHub Pages` terminou com sucesso no run `32447885899`: instalação, build estático, fallback SPA, configuração e upload do artefato concluíram sem erro.

A API do repositório reportou `status: built`, porém também reportou `build_type: legacy` e `source.branch: main`. A abertura de `https://yurihbo.github.io/concord/` retornou a página 404 padrão do GitHub Pages. Isso indica que a fonte do Pages ainda está configurada como publicação da branch `main`, em vez de **GitHub Actions**. O workflow está correto; é necessária a alteração manual em **Settings → Pages → Source → GitHub Actions**. Após essa alteração, deve-se recarregar o domínio e executar a validação manual de login, Firestore, salas, áudio e WebRTC.

A validação do seletor nativo de compartilhamento de tela continua pendente em ambiente com dispositivos reais; a implementação automatizada já diferencia cancelamento voluntário e bloqueio do navegador sem instruir o usuário a procurar uma permissão inexistente.

## Atualização posterior

Após a alteração manual, a API passou a reportar `build_type: workflow`, e os runs `32447985123` e `32447885899` terminaram com sucesso. Os deployments associados reportaram estado `success` e URL `https://yurihbo.github.io/concord/`. Ainda assim, as verificações em `https://yurihbo.github.io/concord/` e com cache-buster retornaram `404 There isn't a GitHub Pages site here.`; o domínio ainda não está servindo o deployment apesar do estado verde. Isso requer verificação no painel de Pages/domínio ou suporte do GitHub, não uma alteração no bundle do Concord.
