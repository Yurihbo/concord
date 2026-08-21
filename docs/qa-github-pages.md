# QA do GitHub Pages

Em 21 de agosto de 2026, o workflow `Deploy Concord to GitHub Pages` terminou com sucesso no run `32447885899`: instalação, build estático, fallback SPA, configuração e upload do artefato concluíram sem erro.

A API do repositório reportou `status: built`, porém também reportou `build_type: legacy` e `source.branch: main`. A abertura de `https://yurihbo.github.io/concord/` retornou a página 404 padrão do GitHub Pages. Isso indica que a fonte do Pages ainda está configurada como publicação da branch `main`, em vez de **GitHub Actions**. O workflow está correto; é necessária a alteração manual em **Settings → Pages → Source → GitHub Actions**. Após essa alteração, deve-se recarregar o domínio e executar a validação manual de login, Firestore, salas, áudio e WebRTC.

A validação do seletor nativo de compartilhamento de tela continua pendente em ambiente com dispositivos reais; a implementação automatizada já diferencia cancelamento voluntário e bloqueio do navegador sem instruir o usuário a procurar uma permissão inexistente.

## Atualização posterior

Após a alteração manual, a API passou a reportar `build_type: workflow`, e os runs `32447985123` e `32447885899` terminaram com sucesso. Os deployments associados reportaram estado `success` e URL `https://yurihbo.github.io/concord/`. Ainda assim, as verificações em `https://yurihbo.github.io/concord/` e com cache-buster retornaram `404 There isn't a GitHub Pages site here.`; o domínio ainda não está servindo o deployment apesar do estado verde. Isso requer verificação no painel de Pages/domínio ou suporte do GitHub, não uma alteração no bundle do Concord.

## Inspeção do artefato

O artefato `github-pages` do run `32447985123` foi baixado e extraído localmente. Ele contém `index.html`, `404.html`, `manifest.json`, `sw.js`, `concord-icon.svg` e `assets/` diretamente na raiz do artefato; ambos os HTML têm 368.214 bytes. Portanto, não há diretório extra nem ausência de arquivo no pacote enviado ao GitHub Pages.

## Aplicação publicada acessível

Em 21 de agosto de 2026, o healthcheck passou a retornar HTTP 200 e o navegador carregou o título `Concord — Comunicação simples e intencional` em `https://yurihbo.github.io/concord/`. A tela, porém, permaneceu branca, sem elementos interativos detectados; o console do navegador não exibiu mensagens. É necessário verificar requisições e o conteúdo do HTML/JavaScript publicado antes de iniciar o QA funcional Firebase.

## React carregando e rota publicada

Após o run `32449373278` terminar com sucesso, o domínio passou a retornar o HTML do Concord. A validação em `https://yurihbo.github.io/concord/?version=527905c2` detectou o elemento React `#root` e o 404 interno estilizado do Concord, em vez da tela branca. Isso confirma que o JavaScript agora executa; o próximo diagnóstico deve corrigir o roteamento/base path ou testar a URL sem query antes do QA de login.

## Rota raiz corrigida

Após o run `32449526129` terminar com sucesso, a URL `https://yurihbo.github.io/concord/?version=2dc04045` carregou a tela real de login Firebase, com Google, e-mail, senha e criação de conta. O 404 interno foi resolvido pelo uso da base `/concord/` no Wouter; o white screen também não ocorre mais na publicação configurada.

## Configuração Firebase corrigida

Após o cadastro das variáveis públicas no repositório, o novo workflow `32532435848` terminou com sucesso. A URL publicada voltou a exibir a tela de login Firebase com Google e e-mail/senha; a mensagem `auth/api-key-not-valid` não aparece mais na tela inicial. A autenticação com uma conta real e os fluxos internos continuam aguardando teste manual.
