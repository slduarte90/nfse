'use client';

import { useEffect } from 'react';

type IbgeMunicipality = {
  id: number;
  nome: string;
  microrregiao?: {
    mesorregiao?: {
      UF?: {
        sigla?: string;
      };
    };
  };
};

const cache = new Map<string, IbgeMunicipality[]>();

function ufOf(city: IbgeMunicipality) {
  return city.microrregiao?.mesorregiao?.UF?.sigla || '';
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

async function searchCities(term: string) {
  const key = normalize(term);
  if (key.length < 3) return [];
  if (cache.has(key)) return cache.get(key) || [];

  const response = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome');
  const data = (await response.json()) as IbgeMunicipality[];
  const result = data.filter((city) => normalize(city.nome).includes(key)).slice(0, 12);
  cache.set(key, result);
  return result;
}

function setNativeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function enhanceIbgeField() {
  const ibgeInput = document.querySelector<HTMLInputElement>('[name="municipalIbgeCode"]');
  if (!ibgeInput || ibgeInput.dataset.cityLookupReady === 'true') return;
  ibgeInput.dataset.cityLookupReady = 'true';

  const label = ibgeInput.closest('label');
  if (!label) return;

  const wrapper = document.createElement('label');
  wrapper.className = 'nfse-city-lookup-field';
  wrapper.innerHTML = 'Município <input name="municipalitySearch" placeholder="Digite a cidade. Ex.: Pratápolis" autocomplete="off" /><small>Selecione a cidade para preencher o código IBGE automaticamente.</small><div class="nfse-city-lookup-results" hidden></div>';
  label.parentElement?.insertBefore(wrapper, label);

  const searchInput = wrapper.querySelector<HTMLInputElement>('[name="municipalitySearch"]');
  const results = wrapper.querySelector<HTMLDivElement>('.nfse-city-lookup-results');
  if (!searchInput || !results) return;

  let currentRequest = 0;
  searchInput.addEventListener('input', async () => {
    const request = ++currentRequest;
    const cities = await searchCities(searchInput.value);
    if (request !== currentRequest) return;

    results.replaceChildren();
    if (!cities.length) {
      results.hidden = true;
      return;
    }

    cities.forEach((city) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'nfse-city-lookup-option';
      button.textContent = `${city.nome}/${ufOf(city)} - ${city.id}`;
      button.addEventListener('click', () => {
        searchInput.value = `${city.nome}/${ufOf(city)}`;
        setNativeValue(ibgeInput, String(city.id));
        results.hidden = true;
      });
      results.appendChild(button);
    });

    results.hidden = false;
  });

  document.addEventListener('click', (event) => {
    if (!wrapper.contains(event.target as Node)) results.hidden = true;
  });
}

export function NfseMunicipalityLookup() {
  useEffect(() => {
    const enhance = () => enhanceIbgeField();
    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
