import './style.css';
import type { Worksheet } from './types';
import { generateId } from './utils';

// Verify type resolution: Worksheet must be importable
const _ws: Worksheet = {
  id: generateId(),
  name: 'default',
  items: [],
  modified: false,
};
console.log('AnalySeries session id:', _ws.id);

const app = document.getElementById('app')!;
app.appendChild(document.createTextNode('AnalySeries — ready'));
