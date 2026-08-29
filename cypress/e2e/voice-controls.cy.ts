describe("controles da chamada em grupo", () => {
  const storedVolumes = { "friend-b": 1.5, "friend-c": 0.35 };

  beforeEach(() => {
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("concord.voice.peerVolumes", JSON.stringify(storedVolumes));
      },
    });
  });

  it("persiste os volumes individuais após recarregar a página", () => {
    cy.get('[data-testid="voice-call-stage"]').should("be.visible");
    cy.get('[data-testid="voice-participant-card"][data-self="false"]').first().click();
    cy.get('[data-testid="peer-volume-slider"]')
      .should("have.attr", "min", "0")
      .and("have.attr", "max", "2")
      .invoke("val", 1.75)
      .trigger("input")
      .trigger("change");
    cy.window().its("localStorage").invoke("getItem", "concord.voice.peerVolumes").then((value) => {
      expect(JSON.parse(value ?? "{}" )).to.have.property("friend-b", 1.75);
    });
    cy.reload();
    cy.window().its("localStorage").invoke("getItem", "concord.voice.peerVolumes").then((value) => {
      expect(JSON.parse(value ?? "{}")).to.deep.equal({ "friend-b": 1.75, "friend-c": 0.35 });
    });
  });

  it("silencia e restaura todos os participantes localmente", () => {
    cy.get('[data-testid="voice-call-stage"]').should("be.visible");
    cy.get('[data-testid="mute-all-button"]').should("contain.text", "Mutar todos").click();
    cy.get('[data-testid="mute-all-button"]').should("contain.text", "Restaurar");
    cy.get('[data-testid="muted-all-status"]').should("be.visible").and("contain.text", "Mutar Todos ativo");
    cy.window().its("localStorage").invoke("getItem", "concord.voice.peerVolumes").then((value) => {
      const volumes = JSON.parse(value ?? "{}");
      expect(Object.values(volumes)).to.not.include(1);
      expect(Object.values(volumes)).to.not.include(1.5);
    });
    cy.get('[data-testid="mute-all-button"]').click();
    cy.get('[data-testid="mute-all-button"]').should("contain.text", "Mutar todos");
    cy.get('[data-testid="muted-all-status"]').should("not.exist");
  });
});
