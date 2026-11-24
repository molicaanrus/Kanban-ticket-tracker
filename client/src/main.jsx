import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { getTheme } from './theme.jsx';

document.documentElement.dataset.theme = getTheme();

createRoot(document.getElementById('root')).render(<App />);
