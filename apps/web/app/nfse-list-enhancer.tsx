'use client';

import { useEffect } from 'react';

const invoices = [
  {
    number: '000000001',
    accessKey: '312026051812345678000190000000001',
    taker: 'Cliente Exemplo Serviços LTDA',
    issuedAt: '2026-05-18',
    value: 'R$ 1.250,00',
    status: 'Autorizada',
  },
  {
    number: '000000002',
    accessKey: '312026051812345678900900000000002',
    taker: 'João da Silva',
    issuedAt: '2026-05-18',
    value: 'R$ 480,00',
    status: 'Autorizada',
  },
];

function renderInvoiceRows(section: HTMLElement) {
  const tbody = section.querySelector<HTMLTableSectionElement>('.nfse-table tbody');
  if (!tbody) return;

  const currentRows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>('tr'));
  const alreadyEnhanced = currentRows.length === invoices.length && currentRows.every((row) => row.dataset.nfseEnhanced === 'true');
  if (alreadyEnhanced) return;

  tbody.replaceChildren(
    ...invoices.map((invoice) => {
      const row = document.createElement('tr');
      row.dataset.nfseEnhanced = 'true';
      row.dataset.accessKey = invoice.accessKey;
      row.dataset.status = invoice.status;
      row.dataset.search = `${invoice.number} ${invoice.accessKey} ${invoice.taker} ${invoice.issuedAt} ${invoice.value} ${invoice.status}`.toLowerCase();
      row.innerHTML = `
        <td>
          <div class="nfse-invoice-number">
            <strong>${invoice.number}</strong>
            <small class="nfse-access-key">Chave: ${invoice.accessKey}</small>
          </div>
        </td>
        <td>${invoice.taker}</td>
        <td>${invoice.issuedAt}</td>
        <td>${invoice.value}</td>
        <td><span class="nfse-chip">${invoice.status}</span></td>
        <td>
          <div class="nfse-actions">
            <button class="companies-button companies-button--ghost" type="button">PDF</button>
            <button class="companies-button companies-button--ghost" type="button">XML</button>
          </div>
        </td>`;
      return row;
    }),
  );
}

function bindFilters(section: HTMLElement) {
  const search = section.querySelector<HTMLInputElement>('.nfse-search-row input');
  const status = section.querySelector<HTMLSelectElement>('.nfse-search-row select');
  if (!search || !status) return;

  search.placeholder = 'Buscar por tomador, número, chave de acesso, valor ou status...';
  Array.from(status.options).forEach((option) => {
    option.value = option.textContent?.includes('Todos') ? '' : option.textContent || '';
  });

  const apply = () => {
    const term = search.value.toLowerCase().trim();
    const selected = status.value.toLowerCase().trim();
    section.querySelectorAll<HTMLTableRowElement>('.nfse-table tbody tr').forEach((row) => {
      const rowStatus = (row.dataset.status || row.querySelector('.nfse-chip')?.textContent || '').toLowerCase().trim();
      const text = row.dataset.search || `${row.textContent || ''} ${row.dataset.accessKey || ''}`.toLowerCase();
      row.style.display = (!term || text.includes(term)) && (!selected || selected === rowStatus) ? '' : 'none';
    });
  };

  if (search.dataset.nfseFilterReady !== 'true') {
    search.dataset.nfseFilterReady = 'true';
    search.addEventListener('input', apply);
    status.addEventListener('change', apply);
  }

  apply();
}

export function NfseListEnhancer() {
  useEffect(() => {
    const enhance = () => {
      const section = Array.from(document.querySelectorAll<HTMLElement>('.nfse-section')).find((item) => item.textContent?.includes('Notas Fiscais'));
      if (!section) return;
      renderInvoiceRows(section);
      bindFilters(section);
    };
    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
