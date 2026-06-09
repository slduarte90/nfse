const summaryCards = [
  { label: 'Empresas cadastradas', value: '0', helper: 'Aguardando cadastro inicial' },
  { label: 'NFS-e emitidas', value: '0', helper: 'Fluxo de emissão em desenvolvimento' },
  { label: 'Certificados A1', value: '0', helper: 'Upload e validação em desenvolvimento' },
];

export default function HomePage() {
  return (
    <main className="portal-page">
      <section className="portal-shell">
        <div className="portal-hero">
          <p className="portal-eyebrow">Zip NFS-e</p>
          <h1>Portal do Cliente</h1>
          <p>
            Ambiente gerencial para clientes ZIP Contabilidade.
          </p>
        </div>

        <div className="portal-summary-grid">
          {summaryCards.map((card) => (
            <article className="portal-summary-card" key={card.label}>
              <p>{card.label}</p>
              <strong>{card.value}</strong>
              <span>{card.helper}</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
