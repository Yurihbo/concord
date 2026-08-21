# Referências da adaptação para GitHub Pages

A documentação oficial do GitHub Pages informa que um site pode ser publicado a partir de uma branch ou por um workflow GitHub Actions; para builds que exigem processo próprio, o workflow é a opção recomendada. O site também é público quando publicado, mesmo que o repositório seja privado em planos compatíveis.

Fonte: [GitHub Docs — Configuring a publishing source for your GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

A documentação oficial do Vite orienta definir `base: '/<REPO>/'` quando a aplicação é publicada como project site em `https://<usuario>.github.io/<repo>/`, selecionar GitHub Actions em Settings → Pages e compilar o diretório estático antes de enviar o artefato para o Pages.

Fonte: [Vite — Deploying a Static Site](https://vite.dev/guide/static-deploy)

A página oficial do GitHub Pages diferencia user/organization sites e project sites e confirma que project sites usam a URL com o nome do repositório.

Fonte: [GitHub Pages](https://pages.github.com/)

Para o repositório `Yurihbo/concord`, a configuração adotada no Vite é `base: '/concord/'` somente quando `GITHUB_PAGES=true`; o desenvolvimento Manus continua usando `/`.
