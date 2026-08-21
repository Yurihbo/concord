# QA de paridade Firebase — prévia local

As capturas desktop (1280×720) e mobile (390×844) após a reconstrução do render exibem a estrutura visual original do Concord: trilho de servidores, sidebar de canais, header de conversa, área de mensagens, compositor e painel de membros.

A prévia gerenciada localmente ainda está autenticada no modo tRPC/Manus e, portanto, mostra dados de demonstração da versão original; ela não comprova por si só os dados Firestore. A confirmação do comportamento Firebase publicado exige autenticação no domínio GitHub Pages.

## Confirmação no domínio publicado

Após o workflow `32533521824`, o domínio GitHub Pages carregou o workspace Firebase com a hierarquia original de trilho, sidebar, canais, conversa, compositor e membros. O botão `Criar comunidade` abriu o diálogo Concord / Novo Espaço dentro de um overlay acessível, com campo, Cancelar e Criar comunidade; não houve prompt nativo deslocado.

Ainda não foi submetida uma criação real de comunidade nem iniciado áudio/tela, pois esses passos alteram dados e exigem teste manual deliberado.

## Diagnóstico dos cliques publicados

No domínio publicado, o botão de Notificações atualizou o conteúdo para `Você está em dia.` e o botão `Criar comunidade` abriu o diálogo acessível. Portanto, não há uma falha global de eventos no bundle atual. A conta validada está sem comunidade e sem sala; os controles de sala só aparecem depois de criar uma comunidade e uma sala de voz. A afirmação de que nenhum botão funciona pode estar relacionada a uma versão antiga em cache, a outro usuário/URL ou ao fato de os controles dependerem de uma comunidade existente.
