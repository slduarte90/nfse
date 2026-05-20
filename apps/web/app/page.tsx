const summaryCards = [
  { label: 'Empresas cadastradas', value: '0', helper: 'Aguardando cadastro inicial' },
  { label: 'NFS-e emitidas', value: '0', helper: 'Fluxo mockado sera implementado na proxima etapa' },
  { label: 'Certificados A1', value: '0', helper: 'Upload e validacao em desenvolvimento' },
];

export default function HomePage() {
  return (
    <main className="portal-page">
      <section className="portal-shell">
        <div className="portal-hero">
          <p className="portal-eyebrow">Zip NFS-e</p>
          <h1>Portal de emissao de NFS-e</h1>
          <p>
            Base inicial do frontend. A proxima etapa sera criar login, painel autenticado, cadastro de empresas e emissao mockada com XML e PDF.
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
