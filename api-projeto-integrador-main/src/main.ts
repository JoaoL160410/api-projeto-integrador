import './styles/main.css';
import './legacy/app.js';
import { APP_NAME } from './config/app';
// Inicialização da interface legada preservada enquanto os recursos são migrados para TS.
document.documentElement.dataset.application = APP_NAME.toLowerCase();
