# QA autenticado — 20/08/2026

A sessão OAuth carregou corretamente o workspace autenticado do Concord.

| Fluxo | Resultado |
|---|---|
| Identidade no workspace | Aprovado: Yuri de Sousa Silva e CON-00000001 aparecem no painel do usuário e no chip do cabeçalho. |
| Tela de Amigos | Aprovado em desktop: a tela abre, exibe busca por ID e estados vazios de amigos/solicitações. |
| Navegação lateral | Aprovado: comunidade, Amigos, configurações, sala de voz e perfil estão acessíveis. |
| Entrada em sala de voz | Bloqueada pelo ambiente: o navegador retornou “Requested device not found” ao solicitar microfone. |
| Validação de call ativa | Pendente por ausência de dispositivo de áudio; a UI e os handlers já foram cobertos por TypeScript, Vitest e screenshots do projeto. |

A falha de dispositivo é ambiental e não indica erro de layout ou de autenticação.

## Rechecagem após nova permissão

Após nova tentativa de entrada em ESTUDIO 01, o erro persistiu. A enumeração de dispositivos do navegador retornou uma lista vazia (`[]`), confirmando que esta sessão sandbox não expõe microfone ou câmera ao navegador. Portanto, não há prompt adicional de permissão a aceitar neste ambiente; a limitação ocorre antes da solicitação de mídia.
