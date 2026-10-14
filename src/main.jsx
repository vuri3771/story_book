import { createRoot } from 'react-dom/client';
import App from './App';
import { boot } from './lib/store';
import './styles.css';
import './app.css';

boot().then(() => createRoot(document.getElementById('root')).render(<App/>));
