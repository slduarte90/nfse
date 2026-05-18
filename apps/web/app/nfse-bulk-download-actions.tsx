'use client';

import { useEffect } from 'react';

type ZipEntry = {
  name: string;
  content: string;
};

const encoder = new TextEncoder();

function crc32(bytes: Uint8Array) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function writeUint16(buffer: number[], value: number) {
  buffer.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32(buffer: number[], value: number) {
  buffer.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function createZip(entries: ZipEntry[]) {
  const output: number[] = [];
  const centralDirectory: number[] = [];

  entries.forEach((entry) => {
    const nameBytes = encoder.encode(entry.name);
    const contentBytes = encoder.encode(entry.content);
    const checksum = crc32(contentBytes);
    const localHeaderOffset = output.length;

    writeUint32(output, 0x04034b50);
    writeUint16(output, 20);
    writeUint16(output, 0);
    writeUint16(output, 0);
    writeUint16(output, 0);
    writeUint16(output, 0);
    writeUint32(output, checksum);
    writeUint32(output, contentBytes.length);
    writeUint32(output, contentBytes.length);
    writeUint16(output, nameBytes.length);
    writeUint16(output, 0);
    output.push(...nameBytes, ...contentBytes);

    writeUint32(centralDirectory, 0x02014b50);
    writeUint16(centralDirectory, 20);
    writeUint16(centralDirectory, 20);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint32(centralDirectory, checksum);
    writeUint32(centralDirectory, contentBytes.length);
    writeUint32(centralDirectory, contentBytes.length);
    writeUint16(centralDirectory, nameBytes.length);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint32(centralDirectory, 0);
    writeUint32(centralDirectory, localHeaderOffset);
    centralDirectory.push(...nameBytes);
  });

  const centralDirectoryOffset = output.length;
  output.push(...centralDirectory);
  writeUint32(output, 0x06054b50);
  writeUint16(output, 0);
  writeUint16(output, 0);
  writeUint16(output, entries.length);
  writeUint16(output, entries.length);
  writeUint32(output, centralDirectory.length);
  writeUint32(output, centralDirectoryOffset);
  writeUint16(output, 0);

  return new Blob([new Uint8Array(output)], { type: 'application/zip' });
}

function selectedRows() {
  return Array.from(document.querySelectorAll<HTMLTableRowElement>('.nfse-table tbody tr')).filter((row) => {
    const checkbox = row.querySelector<HTMLInputElement>('input[type="checkbox"]');
    return Boolean(checkbox?.checked);
  });
}

function selectedInvoiceData() {
  return selectedRows().map((row) => {
    const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>('td'));
    const number = cells[1]?.querySelector('strong')?.textContent?.trim() || '';
    const accessKey = cells[1]?.querySelector('.nfse-access-key')?.textContent?.replace('Chave:', '').trim() || '';
    const taker = cells[2]?.textContent?.trim() || '';
    const issuedAt = cells[3]?.textContent?.trim() || '';
    const value = cells[4]?.textContent?.trim() || '';
    const status = cells[5]?.textContent?.trim() || '';
    return { number, accessKey, taker, issuedAt, value, status };
  }).filter((invoice) => invoice.number);
}

function downloadZip(kind: 'pdf' | 'xml') {
  const invoices = selectedInvoiceData();
  if (!invoices.length) return;

  const entries = invoices.map((invoice) => {
    const extension = kind === 'pdf' ? 'pdf' : 'xml';
    const content = kind === 'pdf'
      ? `PDF da NFS-e ${invoice.number}\nTomador: ${invoice.taker}\nEmissão: ${invoice.issuedAt}\nValor: ${invoice.value}\nStatus: ${invoice.status}\nChave: ${invoice.accessKey}\n`
      : `<?xml version="1.0" encoding="UTF-8"?>\n<nfse>\n  <numero>${invoice.number}</numero>\n  <chave>${invoice.accessKey}</chave>\n  <tomador>${invoice.taker}</tomador>\n  <emissao>${invoice.issuedAt}</emissao>\n  <valor>${invoice.value}</valor>\n  <status>${invoice.status}</status>\n</nfse>\n`;
    return { name: `nfse-${invoice.number}.${extension}`, content };
  });

  const url = URL.createObjectURL(createZip(entries));
  const link = document.createElement('a');
  link.href = url;
  link.download = kind === 'pdf' ? 'nfse-pdfs-selecionadas.zip' : 'nfse-xmls-selecionados.zip';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function syncButtons(actions: HTMLElement) {
  const hasSelection = selectedRows().length > 0;
  actions.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
    button.disabled = !hasSelection;
  });
}

function ensureActions() {
  const summary = document.querySelector<HTMLElement>('.nfse-selection-summary');
  if (!summary) return;

  let actions = document.querySelector<HTMLElement>('.nfse-bulk-download-actions');
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'nfse-bulk-download-actions';

    const pdfButton = document.createElement('button');
    pdfButton.className = 'companies-button companies-button--ghost companies-button--mini';
    pdfButton.type = 'button';
    pdfButton.textContent = 'Baixar PDFs .zip';
    pdfButton.addEventListener('click', () => downloadZip('pdf'));

    const xmlButton = document.createElement('button');
    xmlButton.className = 'companies-button companies-button--ghost companies-button--mini';
    xmlButton.type = 'button';
    xmlButton.textContent = 'Baixar XMLs .zip';
    xmlButton.addEventListener('click', () => downloadZip('xml'));

    actions.append(pdfButton, xmlButton);
    summary.appendChild(actions);
  }

  syncButtons(actions);
}

export function NfseBulkDownloadActions() {
  useEffect(() => {
    const sync = () => ensureActions();
    sync();
    document.addEventListener('change', sync);
    document.addEventListener('input', sync);
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener('change', sync);
      document.removeEventListener('input', sync);
      observer.disconnect();
    };
  }, []);

  return null;
}
