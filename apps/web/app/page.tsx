const summaryCards = [
  { label: 'Empresas cadastradas', value: '0', helper: 'Aguardando cadastro inicial' },
  { label: 'NFS-e emitidas', value: '0', helper: 'Fluxo mockado sera implementado na proxima etapa' },
  { label: 'Certificados A1', value: '0', helper: 'Upload e validacao em desenvolvimento' },
];

export default function HomePage() {
  return (
    <main style={{ minHeight: '100vh', background: '#f8fafc', padding: 32, fontFamily: 'Arial, sans-serif' }}>
      <section style={{ maxWidth: 1120, margin: '0 auto' }}>
        <div style={{ marginBottom: 32 }}>
          <p style={{ color: '#2563eb', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Zip NFS-e</p>
          <h1 style={{ fontSize: 42, lineHeight: 1.1, margin: '8px 0', color: '#0f172a' }}>Portal de emissao de NFS-e</h1>
          <p style={{ fontSize: 18, color: '#475569', maxWidth: 720 }}>
            Base inicial do frontend. A proxima etapa sera criar login, painel autenticado, cadastro de empresas e emissao mockada com XML e PDF.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {summaryCards.map((card) => (
            <article key={card.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 24 }}>
              <p style={{ color: '#64748b', margin: 0 }}>{card.label}</p>
              <strong style={{ display: 'block', fontSize: 36, marginTop: 12, color: '#0f172a' }}>{card.value}</strong>
              <p style={{ color: '#64748b', marginBottom: 0 }}>{card.helper}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
