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

let municipalitiesCache: IbgeMunicipality[] | null = null;
const suggestionsCache = new Map<string, IbgeMunicipality[]>();

function ufOf(city: IbgeMunicipality) {
  return city.microrregiao?.mesorregiao?.UF?.sigla || '';
}

function labelOf(city: IbgeMunicipality) {
  return `${city.nome}/${ufOf(city)} - ${city.id}`;
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

async function loadMunicipalities() {
  if (municipalitiesCache) return municipalitiesCache;
  const response = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome');
  municipalitiesCache = (await response.json()) as IbgeMunicipality[];
  return municipalitiesCache;
}

async function searchCities(term: string) {
  const key = normalize(term);
  if (key.length < 3) return [];
  if (suggestionsCache.has(key)) return suggestionsCache.get(key) || [];

  const data = await loadMunicipalities();
  const startsWith = data.filter((city) => normalize(city.nome).startsWith(key));
  const contains = data.filter((city) => !normalize(city.nome).startsWith(key) && normalize(city.nome).includes(key));
  const result = [...startsWith, ...contains].slice(0, 20);
  suggestionsCache.set(key, result);
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
  if (!label?.parentElement) return;

  const listId = `municipality-options-${Math.random().toString(36).slice(2)}`;
  const wrapper = document.createElement('label');
  wrapper.className = 'nfse-city-lookup-field';
  wrapper.innerHTML = `Município
    <input name="municipalitySearch" list="${listId}" placeholder="Digite e selecione o município" autocomplete="off" />
    <datalist id="${listId}"></datalist>
    <small>Ao selecionar o município, o código IBGE será preenchido automaticamente.</small>`;

  label.parentElement.insertBefore(wrapper, label);

  const searchInput = wrapper.querySelector<HTMLInputElement>('[name="municipalitySearch"]');
  const datalist = wrapper.querySelector<HTMLDataListElement>('datalist');
  if (!searchInput || !datalist) return;

  let options: IbgeMunicipality[] = [];
  let currentRequest = 0;

  const fillFromSelectedLabel = () => {
    const selected = options.find((city) => labelOf(city) === searchInput.value);
    if (!selected) return false;
    setNativeValue(ibgeInput, String(selected.id));
    searchInput.value = `${selected.nome}/${ufOf(selected)}`;
    return true;
  };

  searchInput.addEventListener('input', async () => {
    if (fillFromSelectedLabel()) return;

    const request = ++currentRequest;
    const cities = await searchCities(searchInput.value);
    if (request !== currentRequest) return;

    options = cities;
    datalist.replaceChildren();
    cities.forEach((city) => {
      const option = document.createElement('option');
      option.value = labelOf(city);
      datalist.appendChild(option);
    });
  });

  searchInput.addEventListener('change', fillFromSelectedLabel);
  searchInput.addEventListener('blur', fillFromSelectedLabel);
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
