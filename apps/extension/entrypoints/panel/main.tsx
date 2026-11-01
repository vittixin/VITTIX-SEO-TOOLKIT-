import { createRoot } from 'react-dom/client';
import { App } from '../popup/App';
import '../../src/styles/global.css';

createRoot(document.getElementById('root')!).render(<App sidePanel />);
