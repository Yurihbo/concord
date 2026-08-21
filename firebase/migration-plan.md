# Migração Firebase do Concord

## Objetivo

O frontend será publicado como aplicação estática no GitHub Pages. O Firebase fornecerá autenticação, persistência e sincronização em tempo real; o WebRTC continuará transportando áudio, vídeo e tela entre os navegadores.

## Coleções principais

| Domínio atual | Coleção Firebase | Observação |
|---|---|---|
| Usuários | `users/{uid}` | `uid` do Firebase Auth é a identidade primária; `publicId` permanece pesquisável. |
| Comunidades | `communities/{communityId}` | Documento da comunidade. |
| Membros | `communities/{communityId}/members/{uid}` | Presença, papel e participação. |
| Canais | `communities/{communityId}/channels/{channelId}` | Canais de texto e metadados de voz. |
| Mensagens | `communities/{communityId}/messages/{messageId}` | Consultadas por `channelId` e ordenadas por `createdAt`. |
| Salas de voz | `communities/{communityId}/voiceRooms/{roomId}` | Limite de três salas aplicado no cliente e em Cloud Functions/backend seguro. |
| Membros de voz | `communities/{communityId}/voiceMembers/{uid}` | `isSpeaking`, `joinedAt`, mute e presença. |
| Amizades | `friendRequests/{requestId}` | Solicitações e estado entre dois usuários. |
| DMs | `directThreads/{threadId}/messages/{messageId}` | Participantes devem ser mantidos no documento do thread. |
| Sinalização | `communities/{communityId}/signaling/{signalId}` | Offer, answer e ICE de curta duração; documentos devem ser apagados após consumo. |

## Limites de segurança

A chave do Firebase Web App é pública por design e não substitui regras de segurança. Nenhuma `service_account`, `private_key` ou credencial administrativa pode ser enviada ao frontend ou publicada no GitHub Pages. As regras do Firestore devem verificar `request.auth.uid` em toda operação que altera identidade, mensagens, presença ou sinalização.

## WebRTC

O Firebase não transporta a mídia. Ele apenas substitui a camada atual de procedures/polling para descoberta de participantes, presença e sinalização. Áudio, compartilhamento de tela, detector de voz e efeitos sonoros permanecem no navegador, com STUN/TURN configurados separadamente quando necessário.

## Estado da migração

A configuração pública do Firebase foi validada por uma chamada não destrutiva ao endpoint de consulta do Identity Toolkit. A substituição da camada tRPC ainda não foi aplicada; o backend atual permanece preservado até a conclusão do cliente Firebase e dos testes equivalentes.
